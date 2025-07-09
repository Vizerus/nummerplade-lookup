from flask import Flask, request, jsonify
from flask_cors import CORS
import json, os
from datetime import datetime

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"]}})

DATA_PATH = 'license_data.json'

def load_data():
    if os.path.exists(DATA_PATH):
        with open(DATA_PATH, 'r') as file:
            try:
                data = json.load(file)
                data.setdefault("cached_car_data", {})
                data.setdefault("interests", {"makes": {}, "fuel_types": {}, "models": {}, "years": {}})
                data.setdefault("feedback", {})  # Ensure feedback key exists
                return data
            except json.JSONDecodeError:
                pass
    return {"plates": {}, "searches": [], "interests": {"makes": {}, "fuel_types": {}, "models": {}, "years": {}}, "cached_car_data": {}, "feedback": {}}

def save_data(data):
    with open(DATA_PATH, 'w') as file:
        json.dump(data, file, indent=4)
    print(f"Data saved with {len(data['cached_car_data'])} cached cars and {len(data['interests'].get('makes', {}))} makes")

@app.route('/api/record', methods=['POST'])
def record_license():
    content = request.json
    license_plate = content.get('license', '').upper()
    valid = content.get('valid', False)
    data = load_data()
    plate_data = data["plates"].setdefault(license_plate, {"valid_count": 0, "total_count": 0})
    plate_data["total_count"] += 1
    if valid:
        plate_data["valid_count"] += 1
    for search in data["searches"]:
        if search["plate"] == license_plate:
            search["timestamp"] = datetime.now().isoformat()
            break
    else:
        data["searches"].append({"plate": license_plate, "valid": valid, "timestamp": datetime.now().isoformat()})
    if len(data["searches"]) > 100:
        data["searches"] = data["searches"][-100:]
    save_data(data)
    print(f"Recorded license: {license_plate}, valid: {valid}")
    return jsonify({"status": "recorded"})

@app.route('/api/cache_car', methods=['POST'])
def cache_car_data():
    content = request.json
    license_plate = content.get('license', '').upper()
    data = load_data()
    data["cached_car_data"][license_plate] = content.get('car_data', {})
    save_data(data)
    print(f"Cached car data for license: {license_plate}")
    return jsonify({"status": "cached"})

@app.route('/api/record_interest', methods=['POST'])
def record_interest():
    content = request.json
    license_plate = content.get('license', '').upper()
    car_data = content.get('car_data', {})
    data = load_data()
    interests = data.setdefault("interests", {"makes": {}, "fuel_types": {}, "models": {}, "years": {}})
    for key in ["make", "fuel_type", "model"]:
        if car_data.get(key):
            interests[key + 's'][car_data[key]] = interests[key + 's'].get(car_data[key], 0) + 1
    if car_data.get('first_registration'):
        year = car_data.get('first_registration')[:4]
        interests["years"][year] = interests["years"].get(year, 0) + 1
    save_data(data)
    print(f"Recorded interest for license: {license_plate}")
    return jsonify({"status": "recorded"})

@app.route('/api/predict', methods=['POST'])
def predict_license():
    content = request.json
    partial_license = content.get('license', '').upper()
    most_frequent_interests = content.get('most_frequent_interests', {"make": "SUZUKI", "fuel_type": "Benzin", "model": "ALTO", "year": "2004"})
    search_history = content.get('search_history', [])
    
    if not partial_license:
        return jsonify({"predictions": []})
    
    data = load_data()
    similar_plates = []

    for plate, stats in data["plates"].items():
        if plate.startswith(partial_license):
            validity_ratio = stats["valid_count"] / max(1, stats["total_count"])
            frequency_factor = min(2.0, stats["total_count"] / 5)
            recency_factor = 0.0
            if plate in search_history:
                recency_index = search_history.index(plate)
                recency_factor = max(0.5, 1.0 - (recency_index / len(search_history)))
            interest_factor = 1.0
            if plate in data["cached_car_data"]:
                car_data = data["cached_car_data"][plate]
                for key, weight in [("make", 0.4), ("fuel_type", 0.3), ("model", 0.2), ("first_registration", 0.1)]:
                    if car_data.get(key):
                        interest_factor += weight * (2.0 if car_data[key] == most_frequent_interests.get(key) else 0.5)
            feedback_factor = 1.0
            if plate in data["feedback"]:
                feedback_scores = [1 if fb["relevant"] else -1 for fb in data["feedback"][plate]]
                feedback_factor += sum(feedback_scores) / len(feedback_scores) / 5.0  # Normalize feedback score

            confidence = (0.2 * validity_ratio + 0.4 * frequency_factor + 0.1 * recency_factor + 0.2 * interest_factor + 0.1 * feedback_factor) * 50
            confidence *= (1 + len(partial_license) / 10)  # Increase confidence based on input length

            similar_plates.append({"plate": plate, "confidence": confidence})
            print(f"Plate: {plate}, Validity Ratio: {validity_ratio}, Frequency Factor: {frequency_factor}, Recency Factor: {recency_factor}, Interest Factor: {interest_factor}, Feedback Factor: {feedback_factor}, Confidence: {confidence}")

    similar_plates = sorted(similar_plates, key=lambda x: x["confidence"], reverse=True)
    print(f"Similar Plates: {similar_plates}")
    return jsonify({"predictions": similar_plates[:5]})

@app.route('/api/feedback', methods=['POST'])
def feedback():
    content = request.json
    license_plate = content.get('license', '').upper()
    relevant = content.get('relevant', False)
    data = load_data()
    feedback_data = data["feedback"].setdefault(license_plate, [])
    feedback_data.append({"relevant": relevant, "timestamp": datetime.now().isoformat()})
    save_data(data)
    print(f"Feedback recorded for license: {license_plate}, relevant: {relevant}")
    return jsonify({"status": "feedback recorded"})

@app.route('/api/ping', methods=['GET'])
def ping():
    return jsonify({"status": "running"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)