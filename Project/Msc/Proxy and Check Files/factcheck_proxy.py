from flask import Flask, request, jsonify
from gradio_client import Client
import traceback

app = Flask(__name__)

HF_SPACE = "Mohammedmarzuk17/Edushield-AI-Backend"

client = Client(HF_SPACE)

@app.route("/factcheck", methods=["POST"])
def factcheck():
    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return jsonify({"error": "Invalid request body"}), 400

    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        # ✅ explicitly specify endpoint
        result = client.predict(
            text,
            api_name="/predict"
        )

        return jsonify({"result": result})

    except Exception as e:
        print("HF BACKEND ERROR")
        traceback.print_exc()
        return jsonify({
            "error": "HF backend failed",
            "details": str(e)
        }), 503


if __name__ == "__main__":
    print("Proxy running at http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
