import os
import time
from app_settings import get_setting_int, get_setting_float
from datetime import datetime
try:
    from deepface import DeepFace
except ImportError:
    DeepFace = None
import config

KNOWN_FACES_DIR = "known_faces"
VALID_PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png")

_face_cache = {"has_photos": False, "photo_counts": {}, "ts": 0}
_FACE_CACHE_TTL = 15  # seconds

def _get_known_faces_info():
    now = time.time()
    if now - _face_cache["ts"] < _FACE_CACHE_TTL:
        return _face_cache["has_photos"], _face_cache["photo_counts"]
    has_photos = False
    photo_counts = {}
    for root, dirs, files in os.walk(KNOWN_FACES_DIR):
        image_files = [f for f in files if f.lower().endswith(VALID_PHOTO_EXTENSIONS)]
        if image_files:
            has_photos = True
            folder_name = os.path.basename(root)
            photo_counts[folder_name] = len(image_files)
    _face_cache.update(has_photos=has_photos, photo_counts=photo_counts, ts=now)
    return has_photos, photo_counts

def recognize_faces(frame):
    """Takes a webcam frame, returns a list of names — one per detected face.
    Unmatched faces show as 'Unknown'. Empty list means no faces detected at all."""
    if DeepFace is None:
        return []
    has_photos = False
    photo_counts = {}
    for root, dirs, files in os.walk(KNOWN_FACES_DIR):
        image_files = [f for f in files if f.lower().endswith(VALID_PHOTO_EXTENSIONS)]
        if image_files:
            has_photos = True
            folder_name = os.path.basename(root)
            photo_counts[folder_name] = len(image_files)

    if not has_photos:
        try:
            faces = DeepFace.extract_faces(
                img_path=frame,
                detector_backend="mtcnn",
                enforce_detection=False
            )
            confident_faces = [f for f in faces if f.get("confidence", 1) > 0]
            print(f"[DEBUG] No employees registered — {len(confident_faces)} face(s) detected, all Unknown")
            return ["Unknown"] * len(confident_faces)
        except Exception as e:
            print(f"[recognize_faces ERROR] face detection with no employees failed: {e}")
            return []

    try:
        results = DeepFace.find(
            img_path=frame,
            db_path=KNOWN_FACES_DIR,
            enforce_detection=False,
            detector_backend="mtcnn",
            distance_metric="cosine",
            threshold=1.0,
            silent=True
        )

        if not results:
            print("[DEBUG] 0 faces detected in frame")
            return []

        print(f"[DEBUG] {len(results)} face(s) detected in frame")

        names = []
        for face_result in results:
            if len(face_result) == 0:
                names.append("Unknown")
                continue

            distance_col = [c for c in face_result.columns if "distance" in c.lower()][0]

            matches_by_employee = {}
            for _, row in face_result.iterrows():
                identity_path = row["identity"]
                folder_name = os.path.basename(os.path.dirname(identity_path))
                matches_by_employee.setdefault(folder_name, []).append(row[distance_col])

            min_matching = get_setting_int("min_matching_photos") or 2
            max_distance = get_setting_float("match_distance_threshold")

            margin = get_setting_float("match_margin") or 0.05
            candidates = []
            for folder_name, raw_distances in matches_by_employee.items():
                distances = raw_distances
                if max_distance is not None:
                    distances = [d for d in raw_distances if d <= max_distance]
                required = min(min_matching, photo_counts.get(folder_name, 1))
                print(f"[DEBUG] {folder_name}: {len(distances)} photo(s) matched (need {required}), raw distances: {raw_distances}, filtered: {distances}")
                if len(distances) >= required:
                    avg_distance = sum(distances) / len(distances)
                    candidates.append((folder_name, avg_distance))

            accepted_name = "Unknown"
            if candidates:
                candidates.sort(key=lambda c: c[1])
                best_folder, best_avg = candidates[0]
                if len(candidates) == 1:
                    accepted_name = best_folder.replace("_", " ")
                else:
                    _, second_avg = candidates[1]
                    if (second_avg - best_avg) >= margin:
                        accepted_name = best_folder.replace("_", " ")
                    else:
                        print(f"[DEBUG] Ambiguous: {best_folder} ({best_avg:.3f}) vs runner-up ({second_avg:.3f}) — margin too small, rejecting both")

            names.append(accepted_name)

        return names
    except Exception as e:
        import traceback
        print(f"[recognize_faces ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        return []