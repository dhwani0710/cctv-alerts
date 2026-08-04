# Store operating hours — used to decide if an unknown person is a customer or a threat
STORE_OPEN_TIME = "10:00"
STORE_CLOSE_TIME = "21:00"

# Overstay alert thresholds (minutes past shift_end)
LOW_THRESHOLD_MIN = 30      # 0-30 min past shift end = low
MEDIUM_THRESHOLD_MIN = 60   # 30-60 min = medium, beyond = high

# How often (seconds) the camera worker runs face recognition on a frame
RECOGNITION_INTERVAL_SEC = 5
CURRENTLY_DETECTED_TIMEOUT_SEC = 10  # how long someone stays "currently detected" without a fresh match

UNKNOWN_STREAK_THRESHOLD = 2  # consecutive "Unknown" reads required before treating it as a real stranger