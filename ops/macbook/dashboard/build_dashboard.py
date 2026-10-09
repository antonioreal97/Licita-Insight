#!/usr/bin/env python3
"""Builds dashboards/abriu-la-admin.json from panels.py. Run after editing a query: python3 build_dashboard.py"""

import json
from pathlib import Path

from panels import PANELS

HERE = Path(__file__).resolve().parent
SQL_DATASOURCE = {"type": "grafana-postgresql-datasource", "uid": "licita-pg"}
PROMETHEUS_DATASOURCE = {"type": "prometheus", "uid": "licita-prometheus"}
WIDTH = {"stat": 6, "timeseries": 12, "table": 12}
HEIGHT = {"stat": 5, "timeseries": 9, "table": 9}
FULL_WIDTH_TABLES = {"Usuários recentes", "Última execução por fonte", "Cota de processos por usuário e dia (30 dias)"}


def panel(panel_id: int, title: str, kind: str, query, options: dict, x: int, y: int, w: int, h: int) -> dict:
    is_prometheus = options.get("datasource") == "prometheus"
    datasource = PROMETHEUS_DATASOURCE if is_prometheus else SQL_DATASOURCE
    field_defaults: dict = {"unit": options.get("unit", "none")}
    if "decimals" in options:
        field_defaults["decimals"] = options["decimals"]
    result: dict = {
        "id": panel_id,
        "type": kind,
        "title": title,
        "datasource": datasource,
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "fieldConfig": {"defaults": field_defaults, "overrides": []},
    }
    if is_prometheus:
        queries = query if isinstance(query, list) else [{"expr": query, "legend": options.get("legend", "")}]
        result["targets"] = [{
            "refId": chr(ord("A") + index),
            "datasource": datasource,
            "editorMode": "code",
            "expr": item["expr"].strip(),
            "legendFormat": item.get("legend", ""),
            "range": kind != "stat",
            "instant": kind == "stat",
        } for index, item in enumerate(queries)]
    else:
        result["targets"] = [{
            "refId": "A",
            "datasource": datasource,
            "editorMode": "code",
            "rawQuery": True,
            "format": "table",
            "rawSql": query.strip(),
        }]
    if kind == "stat":
        result["options"] = {
            "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
            "textMode": "value_and_name",
            "colorMode": "none",
            "graphMode": "none",
            "justifyMode": "center",
        }
    elif kind == "timeseries":
        field_defaults["custom"] = {
            "drawStyle": "bars" if options.get("bars") else "line",
            "fillOpacity": 80 if options.get("bars") else 10,
            "lineWidth": 1,
            "stacking": {"mode": "normal" if options.get("stack") else "none", "group": "A"},
            "showPoints": "never",
        }
        result["options"] = {"legend": {"displayMode": "list", "placement": "bottom", "showLegend": True},
                             "tooltip": {"mode": "multi", "sort": "none"}}
        if not is_prometheus:
            result["description"] = "Janela fixa dos últimos 30 dias (fuso de São Paulo); não depende do seletor de tempo."
    else:
        result["options"] = {"showHeader": True, "cellHeight": "sm"}
    if "description" in options:
        result["description"] = options["description"]
    return result


def build() -> dict:
    panels: list = []
    y = 0
    next_id = 1
    sections: list[str] = []
    for section, *_ in PANELS:
        if section not in sections:
            sections.append(section)
    for section in sections:
        panels.append({"id": next_id, "type": "row", "title": section, "collapsed": False,
                       "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}, "panels": []})
        next_id += 1
        y += 1
        x = 0
        row_height = 0
        for _, title, kind, query, options in (p for p in PANELS if p[0] == section):
            w = options.get("width", 24 if title in FULL_WIDTH_TABLES else WIDTH[kind])
            h = HEIGHT[kind]
            if x + w > 24:
                x, y, row_height = 0, y + row_height, 0
            panels.append(panel(next_id, title, kind, query, options, x, y, w, h))
            next_id += 1
            x += w
            row_height = max(row_height, h)
        y += row_height
    return {
        "uid": "abriu-la-admin",
        "title": "Pardal Digital — Admin",
        "tags": ["pardal-digital", "abriu-la"],
        "timezone": "America/Sao_Paulo",
        "editable": False,
        "graphTooltip": 1,
        "refresh": "15s",
        "time": {"from": "now-6h", "to": "now"},
        "timepicker": {"hidden": False},
        "templating": {"list": [
            {
                "name": "container",
                "label": "Containers",
                "type": "custom",
                "query": "app,postgres,proxy,ocr,grafana,prometheus",
                "options": [],
                "multi": True,
                "includeAll": True,
                "allValue": "app|postgres|proxy|ocr|grafana|prometheus",
                "current": {"text": ["All"], "value": ["$__all"]},
            },
            {
                "name": "daily_process_limit",
                "label": "Limite diário de processos",
                "type": "textbox",
                "query": "10",
                "options": [],
                "current": {"text": "10", "value": "10"},
            },
            {
                "name": "monthly_brl",
                "label": "Mensalidade (R$)",
                "type": "textbox",
                "query": "49.90",
                "options": [],
                "current": {"text": "49.90", "value": "49.90"},
            },
        ]},
        "schemaVersion": 39,
        "version": 1,
        "panels": panels,
    }


if __name__ == "__main__":
    out = HERE / "dashboards" / "abriu-la-admin.json"
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{out.relative_to(HERE)}: {len(PANELS)} panels")
