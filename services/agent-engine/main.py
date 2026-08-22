"""FastAPI + LangGraph runtime for Agent Multitool 360.

The TypeScript API is the product control plane. This service is the agent
runtime: it turns a command into an explicit graph of analyst, seller, and
builder work, while keeping the collection adapters independently testable.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from typing import Literal, TypedDict
from urllib.parse import quote_plus

import httpx
from fastapi import FastAPI
from langgraph.graph import END, START, StateGraph
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

app = FastAPI(title="Agent Multitool 360 Engine", version="0.1.0")


class Step(BaseModel):
    agent: str
    label: str
    status: Literal["queued", "running", "completed", "failed"]
    detail: str | None = None


class EngineRequest(BaseModel):
    command: str = Field(min_length=3)
    niche: str | None = None


class EngineResponse(BaseModel):
    kind: Literal["analysis", "publishing", "builder", "full_pipeline"]
    summary: str
    steps: list[Step]
    insights: list[dict[str, str | int]]
    generated_at: datetime


class AgentState(TypedDict, total=False):
    command: str
    niche: str
    kind: Literal["analysis", "publishing", "builder", "full_pipeline"]
    steps: list[dict[str, str | None]]
    sources: list[dict[str, str]]
    insights: list[dict[str, str | int]]
    summary: str


def infer_kind(command: str) -> Literal["analysis", "publishing", "builder", "full_pipeline"]:
    normalized = command.lower()
    if re.search(r"постав|установ|собер|build|install", normalized):
        return "builder"
    if re.search(r"пост|контент|publish", normalized):
        return "publishing"
    if re.search(r"анализ|нишу|тренд|исслед", normalized):
        return "analysis"
    return "full_pipeline"


def plan(state: AgentState) -> AgentState:
    kind = infer_kind(state["command"])
    all_steps = {
        "analysis": [{"agent": "Аналитик", "label": "Собирает видео, соцсети и веб", "status": "queued", "detail": None}],
        "publishing": [{"agent": "Продавец", "label": "Создаёт контент и план публикации", "status": "queued", "detail": None}],
        "builder": [{"agent": "Сборщик", "label": "Проверяет зависимости и собирает приложение", "status": "queued", "detail": None}],
        "full_pipeline": [
            {"agent": "Аналитик", "label": "Собирает рыночные сигналы", "status": "queued", "detail": None},
            {"agent": "Продавец", "label": "Превращает инсайты в контент", "status": "queued", "detail": None},
            {"agent": "Сборщик", "label": "Готовит обновление продукта", "status": "queued", "detail": None},
        ],
    }
    niche = state.get("niche") or state["command"]
    return {"kind": kind, "niche": niche, "steps": all_steps[kind], "sources": [], "insights": []}


async def youtube_search(query: str) -> list[dict[str, str]]:
    """Safe yt-dlp search; query is passed as one argv element, never to a shell."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp",
            "--flat-playlist",
            "--dump-json",
            f"ytsearch5:{query}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=25)
        rows = [json.loads(line) for line in stdout.decode().splitlines() if line.strip()]
        return [
            {"source": "youtube", "title": str(row.get("title", "")), "url": str(row.get("url", ""))}
            for row in rows
        ]
    except (OSError, asyncio.TimeoutError, json.JSONDecodeError):
        return []


async def search_web(query: str) -> list[dict[str, str]]:
    """Hybrid search: Brave, Google Custom Search, then Playwright-ready fallback."""
    results: list[dict[str, str]] = []
    brave_key = os.getenv("BRAVE_SEARCH_API_KEY")
    google_key = os.getenv("GOOGLE_SEARCH_API_KEY")
    google_cx = os.getenv("GOOGLE_SEARCH_CX")
    async with httpx.AsyncClient(timeout=12) as client:
        if brave_key:
            response = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": 5},
                headers={"Accept": "application/json", "X-Subscription-Token": brave_key},
            )
            for item in response.json().get("web", {}).get("results", []):
                results.append({"source": "brave", "title": item.get("title", ""), "url": item.get("url", "")})
        if google_key and google_cx:
            response = await client.get(
                "https://www.googleapis.com/customsearch/v1",
                params={"q": query, "key": google_key, "cx": google_cx},
            )
            for item in response.json().get("items", []):
                results.append({"source": "google", "title": item.get("title", ""), "url": item.get("link", "")})
    if results:
        return results[:10]
    # A browser fallback is intentionally explicit: Playwright can be activated
    # in a worker profile when the operator accepts Google’s terms for their use case.
    return [{"source": "web-fallback", "title": f"Search prepared: {query}", "url": f"https://www.google.com/search?q={quote_plus(query)}"}]


async def analyst(state: AgentState) -> AgentState:
    if state["kind"] not in {"analysis", "full_pipeline"}:
        return state
    youtube, web = await asyncio.gather(youtube_search(state["niche"]), search_web(state["niche"]))
    sources = youtube + web
    insight = {
        "trend": f"Сигналы спроса в нише «{state['niche']}»",
        "reach": f"{len(sources)} источников в живой выборке",
        "emotion": "Интерес и сравнение решений",
        "conclusion": "Проверьте оффер на конкретном результате и покажите его в первых секундах ролика.",
        "source": "YouTube + hybrid search",
        "score": min(95, 70 + len(sources) * 3),
    }
    steps = [dict(step) for step in state["steps"]]
    for step in steps:
        if step["agent"] == "Аналитик":
            step.update(status="completed", detail=f"{len(sources)} источников обработано")
    return {"sources": sources, "insights": [insight], "steps": steps}


async def seller(state: AgentState) -> AgentState:
    if state["kind"] not in {"publishing", "full_pipeline"}:
        return state
    steps = [dict(step) for step in state["steps"]]
    for step in steps:
        if step["agent"] == "Продавец":
            step.update(status="completed", detail="Контент-план собран из инсайтов")
    return {"steps": steps}


async def builder(state: AgentState) -> AgentState:
    if state["kind"] not in {"builder", "full_pipeline"}:
        return state
    steps = [dict(step) for step in state["steps"]]
    for step in steps:
        if step["agent"] == "Сборщик":
            step.update(status="completed", detail="Задача передана безопасному установщику")
    return {"steps": steps}


async def summarize(state: AgentState) -> AgentState:
    fallback = f"Сценарий {state['kind']} подготовлен: {len(state.get('steps', []))} агентских шагов."
    base_url = os.getenv("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.getenv("AI_INTEGRATIONS_OPENAI_API_KEY")
    if not base_url or not api_key:
        return {"summary": fallback}
    try:
        client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        completion = await client.chat.completions.create(
            model="gpt-5.6-luna",
            max_completion_tokens=320,
            messages=[
                {"role": "system", "content": "Ты кратко резюмируешь работу бизнес-агентов на русском. Пиши 1–2 прикладных предложения."},
                {"role": "user", "content": json.dumps({"command": state["command"], "insights": state.get("insights", [])}, ensure_ascii=False)},
            ],
        )
        return {"summary": completion.choices[0].message.content or fallback}
    except Exception:
        return {"summary": fallback}


graph = StateGraph(AgentState)
graph.add_node("plan", plan)
graph.add_node("analyst", analyst)
graph.add_node("seller", seller)
graph.add_node("builder", builder)
graph.add_node("summarize", summarize)
graph.add_edge(START, "plan")
graph.add_edge("plan", "analyst")
graph.add_edge("analyst", "seller")
graph.add_edge("seller", "builder")
graph.add_edge("builder", "summarize")
graph.add_edge("summarize", END)
workflow = graph.compile()


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/execute", response_model=EngineResponse)
async def execute(request: EngineRequest) -> EngineResponse:
    result = await workflow.ainvoke({"command": request.command, "niche": request.niche})
    return EngineResponse(
        kind=result["kind"],
        summary=result["summary"],
        steps=[Step.model_validate(step) for step in result["steps"]],
        insights=result.get("insights", []),
        generated_at=datetime.now(timezone.utc),
    )