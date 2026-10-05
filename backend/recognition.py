import os
import time
import traceback
from app_settings import get_setting_int, get_setting_float

try:
    from deepface import DeepFace
except ImportError as e:
    print(f"[recognition] DeepFace import failed: {e}")
    DeepFace = None

import config  # kept from your original file

KNOWN_FACES_DIR = "known_faces"
VALID_PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png")

# Better than the default VGG-Face for CCTV / webcam quality.
# If you change this, delete the old .pkl file inside known_faces/
# so DeepFace rebuilds the embeddings with the new model.
MODEL_NAME = "Facenet512"
DETECTOR = "mtcnn"
METRIC = "cosine"

# DeepFace's default same-person cosine cutoffs, used when the
# "match_distance_threshold" setting is not set.
DEFAULT_THRESHOLDS = {
    "VGG-Face": 0.68,
    "Facenet": 0.40,
    "Facenet512": 0.30,
    "ArcFace": 0.68,
}

_face_cache = {"has_photos": False, "photo_counts": {}, "ts": 0}
_FACE_CACHE_TTL = 15  # seconds


def _get_known_faces_info():
    now = time.time()
    if now - _face_cache["ts"] < _FACE_CACHE_TTL:
        return _face_cache["has_photos"], _face_cache["photo_counts"]

    has_photos = False
    photo_counts = {}
    for root, _dirs, files in os.walk(KNOWN_FACES_DIR):
        image_files = [f for f in files if f.lower().endswith(VALID_PHOTO_EXTENSIONS)]
        if image_files:
            has_photos = True
            folder_name = os.path.basename(root)
            photo_counts[folder_name] = len(image_files)

    _face_cache.update(has_photos=has_photos, photo_counts=photo_counts, ts=now)
    return has_photos, photo_counts


def recognize_faces(frame):
    """Takes a webcam frame (BGR, as from OpenCV) and returns a list of dictionaries
    with 'name' and 'box' ((x, y, w, h) tuple), one per detected face.
    An empty list means no faces were detected at all."""
    if DeepFace is None:
        return []

    has_photos, photo_counts = _get_known_faces_info()

    # No employees registered: just detect faces and mark all Unknown.
    if not has_photos:
        try:
            faces = DeepFace.extract_faces(
                img_path=frame,
                detector_backend=DETECTOR,
                enforce_detection=False,
            )
            detected = []
            for f in faces:
                if f.get("confidence", 1) > 0:
                    area = f.get("facial_area", {})
                    box = (area.get("x", 0), area.get("y", 0), area.get("w", 0), area.get("h", 0))
                    detected.append({"name": "Unknown", "box": box})
            print(f"[DEBUG] No employees registered - {len(detected)} face(s) detected, all Unknown")
            return detected
        except Exception as e:
            print(f"[recognize_faces ERROR] face detection with no employees failed: {e}")
            return []

    try:
        results = DeepFace.find(
            img_path=frame,
            db_path=KNOWN_FACES_DIR,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR,
            distance_metric=METRIC,
            enforce_detection=False,
            threshold=1.0,  # only controls which rows come back; real filtering is below
            silent=True,
        )

        if not results:
            print("[DEBUG] 0 faces detected in frame")
            return []

        print(f"[DEBUG] {len(results)} face(s) detected in frame")

        min_matching = get_setting_int("min_matching_photos") or 2
        max_distance = get_setting_float("match_distance_threshold")
        if max_distance is None:
            max_distance = DEFAULT_THRESHOLDS.get(MODEL_NAME, 0.4)
        max_distance = min(max_distance, 0.40)

        detected_faces = []
        ext_faces = None

        for i, face_result in enumerate(results):
            # Extract bounding box if available from DeepFace source_x columns
            box = (0, 0, 0, 0)
            if hasattr(face_result, "columns") and "source_x" in face_result.columns and len(face_result) > 0:
                row = face_result.iloc[0]
                box = (int(row.get("source_x", 0)), int(row.get("source_y", 0)), int(row.get("source_w", 0)), int(row.get("source_h", 0)))

            if sum(box) == 0:
                if ext_faces is None:
                    try:
                        ext_faces = DeepFace.extract_faces(img_path=frame, detector_backend=DETECTOR, enforce_detection=False)
                    except Exception:
                        ext_faces = []
                if ext_faces and i < len(ext_faces):
                    area = ext_faces[i].get("facial_area", {})
                    box = (area.get("x", 0), area.get("y", 0), area.get("w", 0), area.get("h", 0))

            if len(face_result) == 0:
                detected_faces.append({"name": "Unknown", "box": box})
                continue

            distance_col = [c for c in face_result.columns if "distance" in c.lower()][0]

            # Group distances by employee folder
            matches_by_employee = {}
            for _, row in face_result.iterrows():
                identity_path = row["identity"]
                folder_name = os.path.basename(os.path.dirname(identity_path))
                matches_by_employee.setdefault(folder_name, []).append(row[distance_col])

            margin = get_setting_float("match_margin") or 0.05
            candidates = []

            # Closest employee by best single distance (only used for the debug line)
            closest_folder = None
            closest_distance = None
            closest_matched = 0
            closest_required = 0

            for folder_name, raw_distances in matches_by_employee.items():
                distances = [d for d in raw_distances if d <= max_distance]
                required = min(min_matching, photo_counts.get(folder_name, 1))

                best_single = min(raw_distances)
                if closest_distance is None or best_single < closest_distance:
                    closest_folder = folder_name
                    closest_distance = best_single
                    closest_matched = len(distances)
                    closest_required = required

                if len(distances) >= required:
                    avg_distance = sum(distances) / len(distances)
                    candidates.append((folder_name, avg_distance))

            accepted_name = "Unknown"
            if candidates:
                candidates.sort(key=lambda c: c[1])
                best_folder, best_avg = candidates[0]
                if len(candidates) == 1:
                    accepted_name = best_folder.replace("_", " ").strip()
                else:
                    _, second_avg = candidates[1]
                    if (second_avg - best_avg) >= margin:
                        accepted_name = best_folder.replace("_", " ").strip()
                    else:
                        print(f"[DEBUG] Ambiguous: {best_folder} ({best_avg:.3f}) vs runner-up ({second_avg:.3f}) — margin too small, rejecting both")

            detected_faces.append({"name": accepted_name, "box": box})

            if closest_folder is not None and accepted_name != "Unknown":
                print(
                    f"[DEBUG] Face -> {accepted_name} | closest: {closest_folder}, "
                    f"{closest_matched}/{closest_required} photo(s) within {max_distance}, "
                    f"best distance {round(float(closest_distance), 3)}"
                )

        return detected_faces

    except Exception as e:
        print(f"[recognize_faces ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        return []