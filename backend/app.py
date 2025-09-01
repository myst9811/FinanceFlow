from flask import Flask, request, jsonify
from flask_cors import CORS
from financeflow.db import init_db, SessionLocal
from financeflow import models, ocr, parser, categorize, ml, schemas
from sqlalchemy import select
from datetime import datetime
import pandas as pd


def create_app():
    app = Flask(__name__)
    CORS(app)
    init_db()  # Initialize DB
    return app

app = create_app()

@app.post("/api/upload")
def upload():
    files = request.files.getlist("files")
    txns = []
    for f in files:
        content = f.read()
        text = ocr.extract_text(content, filename=f.filename)
        rows = parser.parse_text(text)
        txns.extend(rows)
    return jsonify({"transactions": txns})

@app.post("/api/transactions")
def insert_transactions():
    payload = request.get_json(force=True)
    items = payload if isinstance(payload, list) else payload.get("transactions", [])
    validated = [schemas.TransactionIn(**i) for i in items]
    with SessionLocal() as db:
        for it in validated:
            t = models.Transaction(
                date=it.date,
                amount=it.amount,
                currency=it.currency,
                description=it.description,
                category=categorize.assign_category(it.description, it.amount)
            )
            db.add(t)
        db.commit()
    return jsonify({"inserted": len(validated)})

@app.get("/api/transactions")
def list_transactions():
    with SessionLocal() as db:
        rows = db.execute(select(models.Transaction)).scalars().all()
        return jsonify([r.to_dict() for r in rows])

@app.get("/api/summary")
def summary():
    with SessionLocal() as db:
        rows = db.execute(select(models.Transaction)).scalars().all()
        df = pd.DataFrame([r.to_dict() for r in rows])
        if df.empty:
            return jsonify({"by_month": [], "by_category": []})
        df["month"] = pd.to_datetime(df["date"]).dt.to_period("M").astype(str)
        by_month = df.groupby("month")["amount"].sum().reset_index().to_dict(orient="records")
        by_cat = df.groupby("category")["amount"].sum().reset_index().to_dict(orient="records")
        savings = ml.simple_savings_forecast(df)
        return jsonify({"by_month": by_month, "by_category": by_cat, "savings_forecast": savings})

@app.get("/api/anomalies")
def anomalies():
    with SessionLocal() as db:
        rows = db.execute(select(models.Transaction)).scalars().all()
        df = pd.DataFrame([r.to_dict() for r in rows])
        if df.empty:
            return jsonify({"anomalies": []})
        outliers = ml.detect_anomalies(df)
        return jsonify({"anomalies": outliers})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
