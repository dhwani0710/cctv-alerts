import threading
from ultralytics import YOLO
import config

YOLO_MODEL = getattr(config, "YOLO_MODEL", "yolo26n.pt")
DETECT_CONF = getattr(config, "DETECT_CONF", 0.5)      # people
ANIMAL_CONF = getattr(config, "ANIMAL_CONF", 0.9)      # animals need higher confidence (keep >= DETECT_CONF)

PERSON = "person"
ANIMALS = {"bird", "cat", "dog","mouse"}

_lock = threading.Lock()   # one inference at a time; camera threads share the model
_model = None
_class_ids = None


def _kind(label):
    if label == PERSON:
        return "person"
    if label in ANIMALS:
        return "animal"
    return None


def _get_model():
    global _model, _class_ids
    if _model is None:
        _model = YOLO(YOLO_MODEL)
        _class_ids = [i for i, n in _model.names.items() if _kind(n)]
    return _model


def detect_objects(frame):
    """Returns [{"kind": "person"|"animal", "label": str, "conf": float, "box": (x, y, w, h)}]"""
    with _lock:
        model = _get_model()
        r = model.predict(frame, classes=_class_ids, conf=DETECT_CONF, verbose=False)[0]
    out = []
    for b in r.boxes:
        label = model.names[int(b.cls[0])]
        kind = _kind(label)
        conf = float(b.conf[0])
        if kind is None or (kind == "animal" and conf < ANIMAL_CONF):
            continue
        x1, y1, x2, y2 = map(int, b.xyxy[0])
        out.append({"kind": kind, "label": label, "conf": conf, "box": (x1, y1, x2 - x1, y2 - y1)})
    return out