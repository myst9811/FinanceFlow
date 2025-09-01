import pandas as pd
from sklearn.ensemble import IsolationForest
from typing import List, Dict

def detect_anomalies(df: pd.DataFrame) -> List[Dict]:
    # expects columns: date (iso), amount (float)
    if df.empty:
        return []
    X = df[["amount"]].values
    iso = IsolationForest(contamination=0.05, random_state=42).fit(X)
    is_outlier = iso.predict(X) == -1
    out = df[is_outlier][["id","date","amount","description","category"]]
    return out.to_dict(orient="records")

def simple_savings_forecast(df: pd.DataFrame) -> Dict:
    # naive: savings = sum(income) - sum(expenses) per month, then project next 3 months as mean
    df["date"] = pd.to_datetime(df["date"])
    df["month"] = df["date"].dt.to_period("M").astype(str)
    df["is_income"] = df["amount"] > 0
    agg = df.groupby(["month","is_income"])["amount"].sum().unstack(fill_value=0)
    agg["savings"] = agg.get(True, 0) - agg.get(False, 0).abs()
    history = agg["savings"].reset_index().rename(columns={"savings":"value"})
    if len(history)==0:
        return {"history": [], "forecast": []}
    mean_savings = history["value"].mean()
    # next 3 pseudo months
    last = pd.to_datetime(history["month"].iloc[-1]+"-01")
    forecast = []
    for i in range(1,4):
        m = (last + pd.offsets.MonthBegin(i)).strftime("%Y-%m")
        forecast.append({"month": m, "value": float(round(mean_savings,2))})
    return {"history": history.to_dict(orient="records"), "forecast": forecast}
