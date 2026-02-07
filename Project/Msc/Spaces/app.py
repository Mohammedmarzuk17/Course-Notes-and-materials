import os
import gradio as gr
import datetime, re, requests
from transformers import pipeline
from sentence_transformers import SentenceTransformer, util
from concurrent.futures import ThreadPoolExecutor

# ---------------------------
# Environment-safe settings
# ---------------------------
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# ---------------------------
# Load Models (SAFE MODE)
# ---------------------------

# Claim Extraction (FORCE slow tokenizer)
claim_model_name = "MoritzLaurer/DeBERTa-v3-base-mnli"
claim_classifier = pipeline(
    "zero-shot-classification",
    model=claim_model_name,
    tokenizer=claim_model_name,
    device=-1,
    use_fast=False   # 🔥 CRITICAL FIX
)
claim_labels = ["factual claim", "opinion", "personal anecdote", "other"]

# AI Text Detection
ai_detect_model_name = "roberta-base-openai-detector"
ai_detector = pipeline(
    "text-classification",
    model=ai_detect_model_name,
    device=-1
)

# Semantic Model (EmbeddingGemma)
SEM_MODEL_NAME = "google/embeddinggemma-300m"
HF_TOKEN = os.getenv("HF_TOKEN")

sem_model = SentenceTransformer(
    SEM_MODEL_NAME,
    use_auth_token=HF_TOKEN
)

# ---------------------------
# Google Search Config
# ---------------------------
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GOOGLE_CX = os.getenv("GOOGLE_CX")

google_quota = {"count": 0, "date": datetime.date.today()}
GOOGLE_DAILY_LIMIT = 100

def check_google_quota():
    global google_quota
    today = datetime.date.today()
    if google_quota["date"] != today:
        google_quota = {"count": 0, "date": today}

# ---------------------------
# Text Split Helper
# ---------------------------
def safe_split_text(text):
    pattern = r'(?<!\d)[.](?!\d)|;'
    return [s.strip() for s in re.split(pattern, text) if len(s.strip()) > 10]

# ---------------------------
# Claim Extraction
# ---------------------------
def extract_claims(text, max_claims=20):
    sentences = safe_split_text(text)

    def classify(s):
        out = claim_classifier(s, claim_labels)
        return {
            "text": s,
            "label": out["labels"][0],
            "score": round(out["scores"][0], 3)
        }

    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(classify, sentences))

    return results[:max_claims]

# ---------------------------
# AI Detection
# ---------------------------
def detect_ai(texts):
    if isinstance(texts, str):
        texts = [texts]
    results = []
    for t in texts:
        r = ai_detector(t)[0]
        label = "AI-generated" if r["label"].lower() in ["fake", "ai-generated"] else "Human"
        results.append({
            "text": t,
            "label": label,
            "score": round(r["score"], 3)
        })
    return results

# ---------------------------
# Keyword + Semantic Fact Check
# ---------------------------
def fetch_google_search_semantic(claim, k=3):
    check_google_quota()
    global google_quota

    if google_quota["count"] >= GOOGLE_DAILY_LIMIT:
        return {"keyword": [], "semantic": []}

    url = (
        "https://www.googleapis.com/customsearch/v1"
        f"?q={requests.utils.quote(claim)}"
        f"&key={GOOGLE_API_KEY}&cx={GOOGLE_CX}&num=10"
    )

    r = requests.get(url).json()
    google_quota["count"] += 1

    items = r.get("items", [])
    snippets = [f"{i['title']}: {i['snippet']}" for i in items]

    keyword_results = snippets[:k]
    if not snippets:
        return {"keyword": keyword_results, "semantic": []}

    q_emb = sem_model.encode(claim, normalize_embeddings=True)
    s_emb = sem_model.encode(snippets, normalize_embeddings=True)
    sims = util.cos_sim(q_emb, s_emb)[0]

    top_idx = sims.argsort(descending=True)[:k]
    semantic_results = [snippets[i] for i in top_idx]

    return {
        "keyword": keyword_results,
        "semantic": semantic_results
    }

# ---------------------------
# Predict
# ---------------------------
def predict(text=""):
    if not text.strip():
        return {"error": "No input provided"}

    full_ai = detect_ai(text)
    sentences = safe_split_text(text)
    full_fc = {s: fetch_google_search_semantic(s) for s in sentences}

    claims = extract_claims(text)
    claim_ai = detect_ai([c["text"] for c in claims])
    claim_fc = {c["text"]: fetch_google_search_semantic(c["text"]) for c in claims}

    return {
        "full_text": {
            "input": text,
            "ai_detection": full_ai,
            "fact_checking": full_fc
        },
        "claims": claims,
        "claims_ai_detection": claim_ai,
        "claims_fact_checking": claim_fc,
        "google_quota_used": google_quota["count"]
    }

# ---------------------------
# UI
# ---------------------------
with gr.Blocks() as demo:
    gr.Markdown("## EduShield AI Backend – Keyword + Semantic Fact Check")
    inp = gr.Textbox(lines=8, label="Input Text")
    btn = gr.Button("Run Analysis")
    out = gr.JSON()
    btn.click(predict, inp, out)

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0")
