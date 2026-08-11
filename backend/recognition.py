
import os
import cv2
import numpy as np

try:
    from deepface import DeepFace
    HAS_DEEPFACE = True
except ImportError:
    HAS_DEEPFACE = False
    print("[recognition] DeepFace not available (using OpenCV face detection fallback)")

KNOWN_FACES_DIR = "known_faces"
VALID_PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png")

def _opencv_fallback_match(frame):
    """Fallback face detection & matching using OpenCV."""
    try:
        photo_files = [f for f in os.listdir(KNOWN_FACES_DIR) if f.lower().endswith(VALID_PHOTO_EXTENSIONS)]
        if not photo_files:
            return "Unknown"

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if hasattr(cv2, 'CascadeClassifier') and hasattr(cv2, 'data'):
            try:
                cascade_path = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
                if os.path.exists(cascade_path):
                    cascade = cv2.CascadeClassifier(cascade_path)
                    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                    if len(faces) == 0:
                        return "Unknown"
            except Exception:
                pass

        face_hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        cv2.normalize(face_hist, face_hist, 0, 1, cv2.NORM_MINMAX)

        best_match_name = "Unknown"
        best_score = -1.0

        for photo_name in photo_files:
            photo_path = os.path.join(KNOWN_FACES_DIR, photo_name)
            known_img = cv2.imread(photo_path, cv2.IMREAD_GRAYSCALE)
            if known_img is None:
                continue
            known_hist = cv2.calcHist([known_img], [0], None, [256], [0, 256])
            cv2.normalize(known_hist, known_hist, 0, 1, cv2.NORM_MINMAX)
            score = cv2.compareHist(face_hist, known_hist, cv2.HISTCMP_CORREL)
            if score > 0.75 and score > best_score:
                best_score = score
                best_match_name = os.path.splitext(photo_name)[0].replace("_", " ")

        return best_match_name
    except Exception as e:
        print(f"[opencv_fallback_match ERROR] {type(e).__name__}: {e}")
        return "Unknown"

def recognize_face(frame):
    """Takes a webcam frame (numpy array), returns a matched employee name or 'Unknown'."""
    photo_files = [f for f in os.listdir(KNOWN_FACES_DIR) if f.lower().endswith(VALID_PHOTO_EXTENSIONS)]
    if not photo_files:
        return "Unknown"

    if HAS_DEEPFACE:
        try:
            results = DeepFace.find(
                img_path=frame,
                db_path=KNOWN_FACES_DIR,
                enforce_detection=False,
                detector_backend="mtcnn",
                distance_metric="cosine",
                threshold=0.75,
                silent=True
            )
            if len(results) > 0 and len(results[0]) > 0:
                best_match = results[0].iloc[0]
                identity_path = best_match["identity"]
                distance_col = [c for c in best_match.index if "distance" in c.lower()]
                distance_val = best_match[distance_col[0]] if distance_col else "N/A"
                print(f"[DEBUG] Best match: {identity_path} | distance: {distance_val}")
                name = os.path.splitext(os.path.basename(identity_path))[0].replace("_", " ")
                return name
            else:
                print("[DEBUG] No match found within threshold — results were empty")
            return "Unknown"
        except Exception as e:
            print(f"[recognize_face ERROR] {type(e).__name__}: {e}")
            return _opencv_fallback_match(frame)
    else:
        return _opencv_fallback_match(frame)

