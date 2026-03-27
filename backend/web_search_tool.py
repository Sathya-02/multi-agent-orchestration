"""
web_search_tool.py — Real-time Web Search for Multi-Agent Orchestration

Provides live search results using zero-API-key providers:

  Provider          Use case                      Library / endpoint
  ─────────────────────────────────────────────────────────────────
  DuckDuckGo        General search, news          duckduckgo-search
  Wikipedia         Factual / encyclopaedic       REST API (no key)
  wttr.in           Weather queries               REST API (no key)
  WorldTimeAPI      Current date / time / TZ      REST API (no key)
  ExchangeRate.host Currency / FX rates           REST API (no key)

Install:
    pip install duckduckgo-search

The tool auto-detects query intent from keywords and routes to the most
appropriate provider. All providers fall back gracefully — if one fails,
the next is tried; if all fail, a clear error is returned.
"""
import re, json, time, logging
from typing import Optional

logger = logging.getLogger("web_search_tool")

# ── Config path ───────────────────────────────────────────────────────────
from pathlib import Path
_CFG_PATH = Path(__file__).parent / "web_search_config.json"

_DEFAULT_CFG = {
    "enabled":           True,
    "provider":          "auto",      # auto | duckduckgo | wikipedia | mock
    "max_results":       5,
    "timeout_seconds":   10,
    "safe_search":       True,
    "region":            "wt-wt",     # DuckDuckGo region (wt-wt = worldwide)
    "fallback_to_mock":  True,        # if real search fails, return mock result
}


def load_config() -> dict:
    cfg = dict(_DEFAULT_CFG)
    if _CFG_PATH.exists():
        try:
            saved = json.loads(_CFG_PATH.read_text(encoding="utf-8"))
            cfg.update(saved)
        except Exception:
            pass
    return cfg


def save_config(cfg: dict) -> None:
    _CFG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────
# Intent detection — routes query to the best provider
# ─────────────────────────────────────────────────────────────────────────

_WEATHER_PATTERNS = re.compile(
    r"\b(weather|forecast|temperature|rain|snow|humidity|wind|climate in|hot|cold|sunny)\b",
    re.IGNORECASE,
)
_TIME_PATTERNS = re.compile(
    r"\b(current time|what time|date today|today.s date|what day|current date|"
    r"time in|timezone|utc|gmt|ist|pst|est|cst|"
    r"today|what.s today|day is today|day today|"
    r"what is today|today.s day|current day|"
    r"day of the week|this week|this month|this year)\b",
    re.IGNORECASE,
)
_CURRENCY_PATTERNS = re.compile(
    r"\b(exchange rate|currency|usd|eur|gbp|inr|jpy|convert|forex|fx rate)\b",
    re.IGNORECASE,
)
_STOCK_PATTERNS = re.compile(
    r"\b(stock price|share price|stock of|shares of|market cap|market capitalization|"
    r"trading at|currently trading|price of.*stock|stock.*price|"
    r"nifty|sensex|bse|nse|nasdaq|nyse|s&p|dow jones|"
    r"infosys|tcs|reliance|wipro|hdfc|icici|apple|google|amazon|"
    r"microsoft|tesla|nvidia|meta|\.ns|\.bse|ticker|equity|"
    r"52.week|dividend|pe ratio|market price)\b",
    re.IGNORECASE,
)
_WIKI_PATTERNS = re.compile(
    r"\b(who is|who was|what is|what was|history of|biography|define|definition of|"
    r"explain|overview of|about|founder of|invented by|born in|capital of)\b",
    re.IGNORECASE,
)
_NEWS_PATTERNS = re.compile(
    r"\b(latest news|breaking news|recent news|today.s news|current news|"
    r"just happened|announced today|news about|headlines)\b",
    re.IGNORECASE,
)


def _detect_intent(query: str) -> str:
    """Return 'weather'|'stock'|'currency'|'news'|'time'|'wiki'|'general'."""
    # Check stock BEFORE time — "Infosys price today" has 'today' but intent is stock
    if _STOCK_PATTERNS.search(query):   return "stock"
    if _WEATHER_PATTERNS.search(query): return "weather"
    if _CURRENCY_PATTERNS.search(query):return "currency"
    if _NEWS_PATTERNS.search(query):    return "news"
    if _TIME_PATTERNS.search(query):    return "time"
    if _WIKI_PATTERNS.search(query):    return "wiki"
    return "general"


# ─────────────────────────────────────────────────────────────────────────
# Provider implementations
# ─────────────────────────────────────────────────────────────────────────

def _search_duckduckgo(query: str, max_results: int = 5,
                       timeout: int = 10, region: str = "wt-wt") -> str:
    """DuckDuckGo text search via duckduckgo-search library."""
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS(timeout=timeout) as ddgs:
            for r in ddgs.text(query, region=region, max_results=max_results):
                title = r.get("title", "")
                body  = r.get("body", "")
                href  = r.get("href", "")
                results.append(f"• {title}\n  {body[:300]}\n  Source: {href}")
        if not results:
            return f"No results found for: {query}"
        header = f"🔍 Web search results for '{query}':\n\n"
        return header + "\n\n".join(results)
    except ImportError:
        return None   # Signal: library not installed
    except Exception as e:
        logger.warning(f"DuckDuckGo search failed for '{query}': {e}")
        return None


def _search_duckduckgo_news(query: str, max_results: int = 5,
                             timeout: int = 10) -> str:
    """DuckDuckGo news search — for recent events."""
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS(timeout=timeout) as ddgs:
            for r in ddgs.news(query, max_results=max_results):
                title  = r.get("title", "")
                body   = r.get("body", "")
                source = r.get("source", "")
                date   = r.get("date", "")
                url    = r.get("url", "")
                results.append(
                    f"• [{date}] {title} — {source}\n  {body[:250]}\n  {url}"
                )
        if not results:
            return None
        return f"📰 News results for '{query}':\n\n" + "\n\n".join(results)
    except Exception as e:
        logger.warning(f"DuckDuckGo news failed: {e}")
        return None


def _search_wikipedia(query: str, timeout: int = 8) -> str:
    """Wikipedia REST summary API — no API key required."""
    try:
        import urllib.request, urllib.parse
        # Try exact title first, then search
        slug    = urllib.parse.quote(query.replace(" ", "_"))
        url     = f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}"
        req     = urllib.request.Request(url, headers={"User-Agent": "multi-agent-research/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data    = json.loads(resp.read().decode("utf-8"))
        title   = data.get("title", query)
        extract = data.get("extract", "")
        page_url= data.get("content_urls", {}).get("desktop", {}).get("page", "")
        if not extract:
            return None
        return (
            f"📖 Wikipedia: {title}\n\n"
            f"{extract[:1200]}"
            + (f"\n\nSource: {page_url}" if page_url else "")
        )
    except Exception as e:
        logger.debug(f"Wikipedia lookup failed for '{query}': {e}")
        return None


def _search_weather(query: str, timeout: int = 8) -> str:
    """wttr.in JSON API — no API key, worldwide coverage."""
    try:
        import urllib.request, urllib.parse
        # Extract location from query
        location = query.lower()
        for strip in ["weather in", "weather", "forecast for", "forecast in",
                      "temperature in", "what's the weather", "what is the weather"]:
            location = location.replace(strip, "").strip()
        location = location.strip("?. ") or "current location"
        slug     = urllib.parse.quote(location)
        url      = f"https://wttr.in/{slug}?format=j1"
        req      = urllib.request.Request(url, headers={"User-Agent": "multi-agent-research/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        current   = data["current_condition"][0]
        area      = data["nearest_area"][0]
        city_name = area["areaName"][0]["value"]
        country   = area["country"][0]["value"]
        temp_c    = current["temp_C"]
        temp_f    = current["temp_F"]
        feels_c   = current["FeelsLikeC"]
        humidity  = current["humidity"]
        wind_kph  = current["windspeedKmph"]
        wind_dir  = current["winddir16Point"]
        desc      = current["weatherDesc"][0]["value"]
        vis_km    = current["visibility"]

        # 3-day forecast
        forecast_lines = []
        for day in data.get("weather", [])[:3]:
            date   = day["date"]
            max_c  = day["maxtempC"]
            min_c  = day["mintempC"]
            hourly = day.get("hourly", [])
            mid    = hourly[len(hourly)//2] if hourly else {}
            day_desc = mid.get("weatherDesc", [{}])[0].get("value", "")
            forecast_lines.append(
                f"  {date}: {min_c}°C – {max_c}°C  {day_desc}"
            )

        return (
            f"🌤️ Weather for {city_name}, {country}\n\n"
            f"  Condition:   {desc}\n"
            f"  Temperature: {temp_c}°C / {temp_f}°F  (feels like {feels_c}°C)\n"
            f"  Humidity:    {humidity}%\n"
            f"  Wind:        {wind_kph} km/h {wind_dir}\n"
            f"  Visibility:  {vis_km} km\n\n"
            f"3-Day Forecast:\n" + "\n".join(forecast_lines)
        )
    except Exception as e:
        logger.warning(f"Weather lookup failed for '{query}': {e}")
        return None


def _search_datetime(query: str, timeout: int = 8) -> str:
    """WorldTimeAPI for current time/date. Falls back to system time."""
    try:
        import urllib.request
        from datetime import datetime, timezone

        # Try to extract timezone from query
        tz_match = re.search(
            r"\b(IST|PST|EST|CST|GMT|UTC|"
            r"America/[\w_]+|Europe/[\w_]+|Asia/[\w_]+|"
            r"Australia/[\w_]+|Pacific/[\w_]+)\b",
            query, re.IGNORECASE,
        )

        if tz_match:
            tz = tz_match.group(1)
            url = f"https://worldtimeapi.org/api/timezone/{tz}"
        else:
            url = "https://worldtimeapi.org/api/ip"

        req = urllib.request.Request(url, headers={"User-Agent": "multi-agent-research/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        dt_str    = data.get("datetime", "")
        timezone_ = data.get("timezone", "UTC")
        day_of_w  = data.get("day_of_week")
        day_names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
        day_name  = day_names[day_of_w] if day_of_w is not None else ""

        # Parse and reformat
        try:
            dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            formatted = dt.strftime("%A, %d %B %Y  %H:%M:%S")
        except Exception:
            formatted = dt_str

        return (
            f"🕐 Current Date & Time\n\n"
            f"  Date:      {formatted}\n"
            f"  Day:       {day_name}\n"
            f"  Timezone:  {timezone_}\n"
            f"  UTC offset:{data.get('utc_offset','')}\n"
            f"  Week:      {data.get('week_number','')}"
        )
    except Exception as e:
        logger.debug(f"WorldTimeAPI failed: {e}")
        # Graceful fallback to system time
        from datetime import datetime
        now = datetime.now()
        return (
            f"🕐 Current Date & Time (system clock)\n\n"
            f"  Date: {now.strftime('%A, %d %B %Y  %H:%M:%S')}\n"
            f"  Note: Could not fetch from WorldTimeAPI — using local system time."
        )


def _search_currency(query: str, timeout: int = 8) -> str:
    """ExchangeRate-API open endpoint — no key required for basic rates."""
    try:
        import urllib.request

        # Extract currency codes
        codes = re.findall(r'\b([A-Z]{3})\b', query.upper())
        base  = codes[0] if codes else "USD"
        url   = f"https://open.er-api.com/v6/latest/{base}"
        req   = urllib.request.Request(url, headers={"User-Agent": "multi-agent-research/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if data.get("result") != "success":
            return None

        rates     = data.get("rates", {})
        updated   = data.get("time_last_update_utc", "")
        # Show commonly requested currencies + any in the query
        show_codes= {"USD","EUR","GBP","INR","JPY","AUD","CAD","CHF","CNY","SGD"}
        for c in codes:
            show_codes.add(c)

        lines = []
        for c in sorted(show_codes):
            if c in rates and c != base:
                lines.append(f"  1 {base} = {rates[c]:.4f} {c}")

        return (
            f"💱 Exchange Rates (base: {base})\n\n"
            + "\n".join(lines)
            + f"\n\n  Updated: {updated}"
        )
    except Exception as e:
        logger.debug(f"Currency lookup failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────
# Mock fallback
# ─────────────────────────────────────────────────────────────────────────

def _search_stock(query: str, timeout: int = 10) -> Optional[str]:
    """
    Fetch live stock price data.
    Strategy:
      1. Try yfinance library (pip install yfinance) — most reliable
      2. Try Yahoo Finance query API — no library needed
      3. Try DuckDuckGo for the ticker + price
    """
    # ── Extract ticker or company name ────────────────────────────────────
    # Map well-known Indian + global company names to tickers
    KNOWN_TICKERS = {
        "infosys": "INFY", "infy": "INFY",
        "tcs": "TCS.NS", "tata consultancy": "TCS.NS",
        "wipro": "WIPRO.NS",
        "reliance": "RELIANCE.NS",
        "hdfc bank": "HDFCBANK.NS", "hdfc": "HDFCBANK.NS",
        "icici bank": "ICICIBANK.NS", "icici": "ICICIBANK.NS",
        "sbi": "SBIN.NS", "state bank": "SBIN.NS",
        "bajaj finance": "BAJFINANCE.NS",
        "hcl": "HCLTECH.NS",
        "kotak": "KOTAKBANK.NS",
        "axis bank": "AXISBANK.NS",
        "apple": "AAPL", "aapl": "AAPL",
        "google": "GOOGL", "alphabet": "GOOGL",
        "microsoft": "MSFT", "msft": "MSFT",
        "amazon": "AMZN", "amzn": "AMZN",
        "tesla": "TSLA", "tsla": "TSLA",
        "nvidia": "NVDA", "nvda": "NVDA",
        "meta": "META", "facebook": "META",
        "netflix": "NFLX",
        "nifty 50": "^NSEI", "nifty": "^NSEI",
        "sensex": "^BSESN", "bse sensex": "^BSESN",
        "s&p 500": "^GSPC", "sp500": "^GSPC",
        "dow jones": "^DJI",
        "nasdaq": "^IXIC",
    }

    q_lower = query.lower()
    ticker  = None

    # Direct ticker pattern (e.g. "INFY", "TCS.NS")
    ticker_match = re.search(r'\b([A-Z]{2,5}(?:\.NS|\.BSE)?)\b', query)
    if ticker_match and ticker_match.group(1) not in ("USD","EUR","INR","GBP","JPY","GET","FOR","THE"):
        ticker = ticker_match.group(1)

    # Map company name to ticker
    if not ticker:
        for name, sym in KNOWN_TICKERS.items():
            if name in q_lower:
                ticker = sym
                break

    # ── Try yfinance ──────────────────────────────────────────────────────
    if ticker:
        try:
            import yfinance as yf
            t    = yf.Ticker(ticker)
            info = t.fast_info
            price       = getattr(info, "last_price", None)
            prev_close  = getattr(info, "previous_close", None)
            day_high    = getattr(info, "day_high", None)
            day_low     = getattr(info, "day_low", None)
            currency    = getattr(info, "currency", "")
            mkt_cap     = getattr(info, "market_cap", None)
            if price:
                change    = price - prev_close if prev_close else 0
                change_pct= (change / prev_close * 100) if prev_close else 0
                arrow     = "▲" if change >= 0 else "▼"
                lines = [
                    f"📈 {ticker} — Live Stock Data",
                    f"",
                    f"  Current Price:  {currency} {price:,.2f}",
                    f"  Change:         {arrow} {change:+.2f} ({change_pct:+.2f}%)",
                    f"  Previous Close: {currency} {prev_close:,.2f}" if prev_close else "",
                    f"  Day High:       {currency} {day_high:,.2f}" if day_high else "",
                    f"  Day Low:        {currency} {day_low:,.2f}" if day_low else "",
                    f"  Market Cap:     {mkt_cap:,.0f} {currency}" if mkt_cap else "",
                    f"",
                    f"  Source: Yahoo Finance (live)",
                ]
                return "\n".join(l for l in lines if l is not None and l.strip() != "" or l == "")
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"yfinance failed for {ticker}: {e}")

        # ── Try Yahoo Finance query API (no library needed) ───────────────
        try:
            import urllib.request, urllib.parse
            params = urllib.parse.urlencode({
                "symbols": ticker,
                "fields": "regularMarketPrice,regularMarketChange,"
                          "regularMarketChangePercent,regularMarketDayHigh,"
                          "regularMarketDayLow,regularMarketPreviousClose,"
                          "marketCap,currency,shortName",
            })
            url = f"https://query1.finance.yahoo.com/v7/finance/quote?{params}"
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            results = (data.get("quoteResponse") or {}).get("result") or []
            if results:
                r         = results[0]
                name      = r.get("shortName", ticker)
                price     = r.get("regularMarketPrice")
                change    = r.get("regularMarketChange", 0)
                change_p  = r.get("regularMarketChangePercent", 0)
                high      = r.get("regularMarketDayHigh")
                low       = r.get("regularMarketDayLow")
                prev      = r.get("regularMarketPreviousClose")
                mkt_cap   = r.get("marketCap")
                currency  = r.get("currency", "")
                arrow     = "▲" if change >= 0 else "▼"

                if price:
                    lines = [
                        f"📈 {name} ({ticker}) — Live Stock Data",
                        f"",
                        f"  Current Price:  {currency} {price:,.2f}",
                        f"  Change:         {arrow} {change:+.2f} ({change_p:+.2f}%)",
                        f"  Prev. Close:    {currency} {prev:,.2f}" if prev else "",
                        f"  Day High:       {currency} {high:,.2f}" if high else "",
                        f"  Day Low:        {currency} {low:,.2f}" if low else "",
                        f"  Market Cap:     {mkt_cap:,.0f}" if mkt_cap else "",
                        f"",
                        f"  Source: Yahoo Finance (live)",
                    ]
                    return "\n".join(l for l in lines if l is not None)
        except Exception as e:
            logger.debug(f"Yahoo Finance API failed for {ticker}: {e}")

    # ── DuckDuckGo fallback ───────────────────────────────────────────────
    ddg_query = f"{query} current stock price today"
    return _search_duckduckgo(ddg_query, max_results=3, timeout=timeout)


def _mock_result(query: str) -> str:
    """
    Honest mock result — clearly labels itself as a mock so the LLM
    does NOT use it as real data. Returns an instruction to enable real search.
    """
    return (
        f"[MOCK — Real-time web search is not enabled or failed]\n"
        f"Query: '{query}'\n\n"
        f"⚠️  IMPORTANT: This is a mock result. Do NOT report this as real data.\n"
        f"To get real-time results:\n"
        f"  1. Enable web search in ⚙️ Settings → 🌐 Web Search\n"
        f"  2. Install DuckDuckGo: pip install duckduckgo-search\n"
        f"  3. For stocks: pip install yfinance\n\n"
        f"Tell the user that real-time data is unavailable and explain how to enable it."
    )


# ─────────────────────────────────────────────────────────────────────────
# Main search dispatcher
# ─────────────────────────────────────────────────────────────────────────

def real_search(query: str) -> str:
    """
    Execute a real-time web search for the given query.
    Auto-detects intent and routes to the best provider.
    Returns a formatted string result suitable for LLM consumption.
    """
    cfg     = load_config()
    timeout = int(cfg.get("timeout_seconds", 10))
    max_res = int(cfg.get("max_results", 5))
    region  = cfg.get("region", "wt-wt")
    fallback= cfg.get("fallback_to_mock", True)
    provider= cfg.get("provider", "auto")

    intent  = _detect_intent(query) if provider == "auto" else "general"

    logger.info(f"Web search: query='{query[:60]}' intent={intent} provider={provider}")

    result: Optional[str] = None

    # ── Fast path: date/time queries always get an immediate answer ───────
    # This guarantees correct date even if WorldTimeAPI is unreachable
    if intent == "time" or provider == "auto":
        simple_date_query = re.search(
            r"\b(today|what day|what.s today|current date|date today|"
            r"day is today|day today|what is today.s date)\b",
            query, re.IGNORECASE
        )
        if simple_date_query and intent == "time":
            from datetime import datetime as _dt
            now = _dt.now()
            result = (
                f"📅 Current Date & Time\n\n"
                f"  Date:    {now.strftime('%A, %d %B %Y')}\n"
                f"  Time:    {now.strftime('%H:%M:%S')}\n"
                f"  Day:     {now.strftime('%A')}\n"
                f"  Month:   {now.strftime('%B %Y')}\n"
                f"  Week:    Week {now.strftime('%W')} of {now.year}\n"
                f"\n  (Source: system clock)"
            )
            # Also try WorldTimeAPI for richer info, don't wait long
            try:
                api_result = _search_datetime(query, timeout=4)
                if api_result:
                    result = api_result
            except Exception:
                pass
            return result

    # ── Route by intent or forced provider ───────────────────────────────
    if provider in ("auto", "duckduckgo"):
        if intent == "weather":
            result = _search_weather(query, timeout=timeout)
        elif intent == "time":
            result = _search_datetime(query, timeout=timeout)
        elif intent == "stock":
            result = _search_stock(query, timeout=timeout)
            if not result:
                result = _search_duckduckgo(f"{query} stock price", max_results=max_res,
                                            timeout=timeout, region=region)
        elif intent == "currency":
            result = _search_currency(query, timeout=timeout)
            if not result:
                result = _search_duckduckgo(query, max_results=max_res,
                                            timeout=timeout, region=region)
        elif intent == "news":
            result = _search_duckduckgo_news(query, max_results=max_res, timeout=timeout)
            if not result:
                result = _search_duckduckgo(query, max_results=max_res,
                                            timeout=timeout, region=region)
        elif intent == "wiki":
            result = _search_wikipedia(query, timeout=timeout)
            if not result:
                result = _search_duckduckgo(query, max_results=max_res,
                                            timeout=timeout, region=region)
        else:
            # General: DuckDuckGo text search
            result = _search_duckduckgo(query, max_results=max_res,
                                        timeout=timeout, region=region)

    elif provider == "wikipedia":
        result = _search_wikipedia(query, timeout=timeout)

    # ── Fallback chain ────────────────────────────────────────────────────
    if result is None and fallback:
        result = _mock_result(query)
    elif result is None:
        result = (
            f"Web search failed for '{query}'. "
            "Install duckduckgo-search: pip install duckduckgo-search"
        )

    return result


def test_search() -> dict:
    """Quick health-check of all providers. Returns a status dict."""
    status = {}

    # DuckDuckGo
    try:
        from duckduckgo_search import DDGS
        with DDGS(timeout=8) as ddgs:
            r = list(ddgs.text("Python programming language", max_results=1))
        status["duckduckgo"] = "ok" if r else "no_results"
    except ImportError:
        status["duckduckgo"] = "not_installed (pip install duckduckgo-search)"
    except Exception as e:
        status["duckduckgo"] = f"error: {e}"

    # Wikipedia
    try:
        r = _search_wikipedia("Python programming language", timeout=6)
        status["wikipedia"] = "ok" if r else "no_results"
    except Exception as e:
        status["wikipedia"] = f"error: {e}"

    # Weather (wttr.in)
    try:
        r = _search_weather("weather in London", timeout=6)
        status["weather_wttr"] = "ok" if r else "no_results"
    except Exception as e:
        status["weather_wttr"] = f"error: {e}"

    # Time (WorldTimeAPI)
    try:
        r = _search_datetime("current time UTC", timeout=6)
        status["datetime_worldtime"] = "ok" if r else "no_results"
    except Exception as e:
        status["datetime_worldtime"] = f"error: {e}"

    # Currency
    try:
        r = _search_currency("USD to EUR exchange rate", timeout=6)
        status["currency_er"] = "ok" if r else "no_results"
    except Exception as e:
        status["currency_er"] = f"error: {e}"

    # Stock (yfinance)
    try:
        import yfinance as yf
        t     = yf.Ticker("AAPL")
        price = t.fast_info.last_price
        status["stock_yfinance"] = f"ok (AAPL: {price:.2f})" if price else "no_data"
    except ImportError:
        status["stock_yfinance"] = "not_installed (pip install yfinance)"
    except Exception as e:
        status["stock_yfinance"] = f"error: {e}"

    # Stock (Yahoo Finance REST fallback)
    try:
        r = _search_stock("AAPL current stock price", timeout=8)
        status["stock_yahoo_api"] = "ok" if r and "Current Price" in (r or "") else f"partial: {str(r)[:60]}"
    except Exception as e:
        status["stock_yahoo_api"] = f"error: {e}"

    return status
