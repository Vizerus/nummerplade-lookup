# Nummerplade Lookup App

Hey! This is a little project for looking up license plates and getting smart suggestions. It uses a Python backend (Flask) and a browser frontend. All the "learning" just lives in `license_data.json`

## What it does
- Look up car info by plate (just type it in or upload a pic)
- Get suggestions as you type
- OCR for license plate images (it'll try to read the plate for you)
- Keeps track of your searches and feedback

## What you need
- Python 3.7 or newer
- Any modern browser (Chrome, Edge, Firefox, whatever)

## How to run it

1. **Install Python**
   - Open a terminal in this folder.
   - Run:
     ```
     pip install flask flask-cors
     ```
   - If `pip` doesn't work, try:
     ```
     python -m pip install flask flask-cors
     ```

2. **Start the backend**
   - In the same terminal, run:
     ```
     python app.py
     ```
   - This starts the backend on `http://localhost:5000/`.

3. **(Optional but better) Start a web server for the frontend**
   - Open a new terminal here and run:
     ```
     python -m http.server 8000
     ```
   - Then go to [http://localhost:8000/index.html](http://localhost:8000/index.html) in your browser.
   - (You can also just double-click `index.html` to open it, but some browsers might block stuff.)

4. **Use it!**
   - Type a plate or upload a photo.
   - You'll get info and suggestions if the backend is running.
   - Feedback and history are saved locally and in `license_data.json`.

## Notes
- All the "learning" and feedback is in `license_data.json`. Don't delete it if you want to keep your data.
- If you edit `license_data.json` by hand, restart the backend.
- The backend has to be running for suggestions and feedback to work.
- The project was tested on danish plates using MotorAPI, you will need to get a key here -> https://www.motorapi.dk/
- Once you obtain a key just add it to #

## What's what
- `app.py` — Python backend
- `index.html` — The web page
- `script.js` — All the browser logic
- `styles.css` — Makes it look nice
- `license_data.json` — Where all the data lives

---

MIT License