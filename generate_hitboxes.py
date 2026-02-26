import cv2
import numpy as np
import json
import os

def process_image(img_path):
    # READ IMAGE WITH ALPHA CHANNEL
    img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
    if img is None: return None
    
    h, w = img.shape[:2]
    # GET ALPHA CHANNEL
    if img.shape[2] == 4:
        alpha = img[:, :, 3]
    else:
        return None
    
    # Threshold alpha to get mask
    _, thresh = cv2.threshold(alpha, 50, 255, cv2.THRESH_BINARY)
    
    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours: return None
    
    # Get largest contour
    cnt = max(contours, key=cv2.contourArea)
    
    # Simplify contour (approxPolyDP)
    # We want around 15-30 vertices
    epsilon = 0.012 * cv2.arcLength(cnt, True)
    approx = cv2.approxPolyDP(cnt, epsilon, True)
    
    # Normalize to [-0.5, 0.5] keeping aspect ratio based on maximum dimension!
    # Wait, in JS I do: const maxDim = Math.max(w, h); renderW = (w/maxDim)*baseSize
    # So the points should be (x / maxDim) - (w / (2*maxDim)) ?
    # Let's check JS: normalized = contour.map(p => ({ x: (p.x / cw) - 0.5, y: (p.y / ch) - 0.5 }));
    # Wait, JS maps to [-0.5, 0.5] for the bounding box of the offCanvas!
    # offCanvas is scaled down from maxDim.
    
    # Let's replicate exact JS math:
    # JS: x: (p.x / w) - 0.5
    pts = []
    for pt in approx:
        px, py = pt[0]
        # map to -0.5 to +0.5 relative to the image bounds
        nx = (px / w) - 0.5
        ny = (py / h) - 0.5
        pts.append({"x": round(nx, 3), "y": round(ny, 3)})
    
    return pts

result = {}
for i in range(15):
    key = f"{i:02d}"
    path = f"d:/Towerofshimon/asset/Illust/{key}.png"
    if os.path.exists(path):
        pts = process_image(path)
        if pts:
            result[key] = pts

# Output as JS formatted string
print("        const overrides = {")
for k, v in result.items():
    print(f"        '{k}': [")
    lines = []
    for i in range(0, len(v), 5):
        chunk = v[i:i+5]
        line = "            " + ", ".join([f"{{ x: {p['x']}, y: {p['y']} }}" for p in chunk]) + ","
        print(line)
    print("        ],")
print("        };")
