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


def recognize_faces(frame, with_boxes=False):
    """Takes a webcam frame (BGR, as from OpenCV) and returns a list of names,
    one per detected face. Unmatched faces show as 'Unknown'.
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
            confident_faces = [f for f in faces if f.get("confidence", 1) > 0]
            print(f"[DEBUG] No employees registered - {len(confident_faces)} face(s) detected, all Unknown")
            if with_boxes:
                out = []
                for f in confident_faces:
                    fa = f.get("facial_area", {})
                    out.append(("Unknown", (int(fa.get("x", 0)), int(fa.get("y", 0)), int(fa.get("w", 0)), int(fa.get("h", 0)))))
                return out
            return ["Unknown"] * len(confident_faces)
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

        names = []
        boxes = []
        for face_result in results:
            box = None
            if len(face_result) > 0 and "source_x" in face_result.columns:
                r0 = face_result.iloc[0]
                box = (int(r0["source_x"]), int(r0["source_y"]), int(r0["source_w"]), int(r0["source_h"]))
            boxes.append(box)

            if len(face_result) == 0:
                names.append("Unknown")
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
            names.append(accepted_name)

            # One line per detected face — only printed for actual matches now,
            # to cut debug noise/overhead when nobody's recognized.
            if closest_folder is not None and accepted_name != "Unknown":
                print(
                    f"[DEBUG] Face -> {accepted_name} | closest: {closest_folder}, "
                    f"{closest_matched}/{closest_required} photo(s) within {max_distance}, "
                    f"best distance {round(float(closest_distance), 3)}"
                )

        if with_boxes:
            return list(zip(names, boxes))
        return names

    except Exception as e:
        print(f"[recognize_faces ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        return []