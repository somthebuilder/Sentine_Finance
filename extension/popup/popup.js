const BACKEND_BASE = "http://localhost:3000";

function $(id) {
  return document.getElementById(id);
}

function showStatus(el, msg, kind) {
  el.textContent = msg;
  el.style.color = kind === "error" ? "var(--bad)" : "var(--muted)";
}

function parseJsonOrCsv(input) {
  const raw = input.trim();
  if (!raw) return [];

  const parseTags = (cell) => {
    const txt = (cell ?? "").toString().trim();
    if (!txt) return [];
    // Allow "a;b;c" or "a|b|c"
    return txt.split(/[;|]/g).map((s) => s.trim()).filter(Boolean);
  };

  // JSON: array or { stocks: [...] }
  if (raw.startsWith("[") || raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.stocks) ? parsed.stocks : null;
    if (!arr) throw new Error("JSON must be an array of stocks or an object with a `stocks` array.");

    return arr.map((s) => {
      const sector = (s.sector ?? "").toString().trim();
      const subSector = s.subSector ? s.subSector.toString().trim() : undefined;
      const tags =
        Array.isArray(s.tags)
          ? s.tags.map((t) => t.toString().trim()).filter((t) => t.length > 0)
          : typeof s.tags === "string"
            ? parseTags(s.tags)
            : [sector, subSector].filter(Boolean);

      return {
        name: (s.name ?? "").toString().trim(),
        sector,
        subSector,
        tags,
        revenueGrowth: Number(s.revenueGrowth ?? 0),
        peRatio: Number(s.peRatio ?? 0),
        institutionalOwnership: Number(s.institutionalOwnership ?? 0),
        momentumScore: Number(s.momentumScore ?? 0),
      };
    });
  }

  // CSV: header row + data rows
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new Error("CSV must include a header row and at least one data row.");

  const header = lines[0].split(",").map((h) => h.trim());
  const required = ["name", "sector", "tags", "revenueGrowth", "peRatio", "institutionalOwnership", "momentumScore"];
  const missing = required.filter((key) => !header.includes(key));
  if (missing.length) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  }

  const idx = {};
  for (const key of header) idx[key] = header.indexOf(key);

  const stocks = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const getNum = (k) => {
      const v = cols[idx[k]];
      if (v === undefined || v === "") return 0;
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`Invalid number in column ${k} on row ${i + 1}.`);
      return n;
    };

    const sector = cols[idx["sector"]] || "";
    const subSector = idx["subSector"] !== undefined ? cols[idx["subSector"]] || "" : "";
    const tagsCell = cols[idx["tags"]] || "";
    const tags = parseTags(tagsCell);

    stocks.push({
      name: cols[idx["name"]] || "",
      sector,
      subSector: subSector || undefined,
      tags: tags.length ? tags : [sector, subSector].filter(Boolean),
      revenueGrowth: getNum("revenueGrowth"),
      peRatio: getNum("peRatio"),
      momentumScore: getNum("momentumScore"),
      institutionalOwnership: getNum("institutionalOwnership"),
    });
  }

  return stocks;
}

function renderTrends(trends) {
  const list = $("trendsList");
  list.innerHTML = "";
  if (!trends || !trends.length) {
    const li = document.createElement("li");
    li.textContent = "No themes yet. Try again after the backend fetches data.";
    list.appendChild(li);
    return;
  }

  for (const t of trends.slice(0, 10)) {
    const li = document.createElement("li");
    const keywords = Array.isArray(t.keywords) ? t.keywords.slice(0, 3).join(", ") : "";
    const driver = Array.isArray(t.drivers) && t.drivers.length ? t.drivers[0] : "";
    li.textContent = `${t.theme ?? "Theme"}${driver ? ` — ${driver}` : ""}${keywords ? ` • keywords: ${keywords}` : ""}`;
    list.appendChild(li);
  }
}

function renderRecommendations(recommendations) {
  const list = $("recsList");
  list.innerHTML = "";
  if (!recommendations || !recommendations.length) {
    const li = document.createElement("li");
    li.textContent = "No recommendations yet. Add a few stocks to start scoring.";
    list.appendChild(li);
    return;
  }

  for (const r of recommendations.slice(0, 12)) {
    const li = document.createElement("li");
    const score = typeof r.score === "number" ? r.score.toFixed(3) : String(r.score ?? "");
    li.textContent = `${r.name} (${r.sector ?? "n/a"}) — score ${score}`;

    const reasons = Array.isArray(r.reason) ? r.reason.slice(0, 3).filter(Boolean) : [];
    if (reasons.length) {
      const reasonsDiv = document.createElement("div");
      reasonsDiv.style.fontSize = "11px";
      reasonsDiv.style.color = "var(--muted)";
      reasonsDiv.textContent = `Reasons: ${reasons.join(" | ")}`;
      li.appendChild(reasonsDiv);
    }
    list.appendChild(li);
  }
}

async function fetchJson(path) {
  const res = await fetch(`${BACKEND_BASE}${path}`, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}). ${text}`.trim());
  }
  return res.json();
}

async function loadTrends() {
  const status = $("trendsStatus");
  showStatus(status, "Loading trends...", null);
  try {
    const data = await fetchJson("/trends");
    const themes = data.themes ?? data.trends ?? data.items ?? [];
    renderTrends(themes);
    status.textContent = "";
  } catch (e) {
    showStatus(status, `Failed to load trends: ${e.message || e}`, "error");
  }
}

async function loadRecommendations() {
  const status = $("recsStatus");
  showStatus(status, "Loading recommendations...", null);
  try {
    const data = await fetchJson("/recommendations");
    const recs = data.recommendations ?? data.items ?? data;
    renderRecommendations(recs);
    status.textContent = "";
  } catch (e) {
    showStatus(status, `Failed to load recommendations: ${e.message || e}`, "error");
  }
}

async function submitStocks() {
  const status = $("stocksStatus");
  const input = $("stocksInput").value;
  status.textContent = "";

  let stocks;
  try {
    stocks = parseJsonOrCsv(input);
  } catch (e) {
    showStatus(status, e.message || String(e), "error");
    return;
  }

  if (!stocks.length) {
    showStatus(status, "Nothing to submit. Paste JSON or CSV.", "error");
    return;
  }

  try {
    const res = await fetch(`${BACKEND_BASE}/stocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stocks }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed (${res.status}). ${text}`.trim());
    }

    showStatus(status, "Stocks saved. Refreshing recommendations...", null);
    await loadRecommendations();
  } catch (e) {
    showStatus(status, `Failed to submit stocks: ${e.message || e}`, "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("submitStocks").addEventListener("click", submitStocks);
  loadTrends();
  loadRecommendations();
});

