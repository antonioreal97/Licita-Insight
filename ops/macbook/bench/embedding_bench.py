"""Benchmark de embeddings para o estudante de categorias, rodado no próprio servidor.

Lê /work/sample.json ([{"text": ..., "categories": [...]}]), gera embeddings em cada modelo pelo Ollama
(OLLAMA_URL) e mede: títulos/s, e acurácia kNN (k=5, cosseno) da categoria principal num split 80/20 fixo.
Escreve /work/result-<modelo>.json e /work/report.md.
"""
import hashlib, json, os, time, urllib.request
import numpy as np

URL = os.environ.get("OLLAMA_URL", "http://ollama-bench:11434")
MODELS = os.environ.get("MODELS", "bge-m3,embeddinggemma:300m,qwen3-embedding:0.6b").split(",")
BATCH = 32
sample = json.load(open("/work/sample.json"))
texts = [" ".join(s["text"].split()).lower() for s in sample]
labels = [s["categories"][0] for s in sample]
test = np.array([int(hashlib.sha256(t.encode()).hexdigest(), 16) % 5 == 0 for t in texts])


def embed(model, batch):
    req = urllib.request.Request(f"{URL}/api/embed", data=json.dumps({"model": model, "input": batch}).encode(),
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.loads(r.read())["embeddings"]


rows = []
for model in MODELS:
    try:
        embed(model, ["aquecimento"])  # carrega o modelo fora da medição
        vecs, start = [], time.time()
        for i in range(0, len(texts), BATCH):
            vecs += embed(model, texts[i:i + BATCH])
        secs = time.time() - start
        v = np.array(vecs, dtype=np.float32)
        v /= np.linalg.norm(v, axis=1, keepdims=True) + 1e-9
        tr, te = v[~test], v[test]
        ytr = np.array(labels)[~test]; yte = np.array(labels)[test]
        sims = te @ tr.T
        top = np.argsort(-sims, axis=1)[:, :5]
        hits = 0
        for i, idx in enumerate(top):
            vals, counts = np.unique(ytr[idx], return_counts=True)
            hits += vals[np.argmax(counts)] == yte[i]
        conf = np.sort(-sims, axis=1)[:, 0] * -1
        rate = len(texts) / secs
        row = {"model": model, "titles": len(texts), "seconds": round(secs, 1), "titles_per_s": round(rate, 2),
               "hours_7500": round(7500 / rate / 3600, 2), "accuracy_knn5": round(hits / len(te), 4),
               "test_size": int(len(te)), "dim": int(v.shape[1]),
               "low_conf_share_lt_0_8": round(float((conf < 0.8).mean()), 3)}
    except Exception as exc:  # modelo que não cabe/não baixa entra no relatório como falha
        row = {"model": model, "error": str(exc)[:300]}
    rows.append(row)
    json.dump(row, open(f"/work/result-{model.replace(':', '_')}.json", "w"))
    print(json.dumps(row), flush=True)

lines = ["| modelo | títulos/s | horas p/ 7.500 | acurácia kNN-5 | dim | % baixa confiança (<0,8) |", "|---|---|---|---|---|---|"]
for r in rows:
    if "error" in r:
        lines.append(f"| {r['model']} | falhou: {r['error']} | | | | |")
    else:
        lines.append(f"| {r['model']} | {r['titles_per_s']} | {r['hours_7500']} | {r['accuracy_knn5']:.1%} | {r['dim']} | {r['low_conf_share_lt_0_8']:.0%} |")
open("/work/report.md", "w").write("\n".join(lines) + "\n")
