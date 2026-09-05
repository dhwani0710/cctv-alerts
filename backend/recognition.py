import os
from datetime import datetime
from deepface import DeepFace
import config

KNOWN_FACES_DIR = "known_faces"
VALID_PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png")

def recognize_faces(frame):
    """Takes a webcam frame, returns a list of names — one per detected face.
    Unmatched faces show as 'Unknown'. Empty list means no faces detected at all."""
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

            from app_settings import get_setting_int
            min_matching = get_setting_int("min_matching_photos") or 2

            accepted_name = "Unknown"
            for folder_name, distances in matches_by_employee.items():
                required = min(min_matching, photo_counts.get(folder_name, 1))
                print(f"[DEBUG] {folder_name}: {len(distances)} photo(s) matched (need {required}), distances: {distances}")
                if len(distances) >= required:
                    accepted_name = folder_name.replace("_", " ")
                    break

            names.append(accepted_name)

        return names
    except Exception as e:
        import traceback
        print(f"[recognize_faces ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        return []