"""
AI Assistant API endpoints with MCP Postgres integration
"""
import os
import json
import httpx
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from .db import connection

router = APIRouter(prefix="/ai", tags=["AI Assistant"])

# MCP Server URL
MCP_POSTGRES_URL = os.getenv("MCP_POSTGRES_URL", "http://localhost:3100")


# =============================================================================
# MODELS
# =============================================================================

class AISettings(BaseModel):
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-20250514"
    api_key: Optional[str] = None


class AISettingsUpdate(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    sql_query: Optional[str] = None
    query_results: Optional[list] = None
    conversation_id: str


# =============================================================================
# DATABASE HELPERS
# =============================================================================

async def _get_setting(conn: AsyncConnection, key: str) -> Optional[str]:
    """Get a single setting from the database"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT setting_value FROM ai_settings WHERE setting_key = %s",
            (key,)
        )
        row = await cur.fetchone()
        return row["setting_value"] if row else None


async def _set_setting(conn: AsyncConnection, key: str, value: str) -> None:
    """Set a single setting in the database"""
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO ai_settings (setting_key, setting_value)
            VALUES (%s, %s)
            ON CONFLICT (setting_key)
            DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
            """,
            (key, value)
        )


async def _get_all_settings(conn: AsyncConnection) -> dict:
    """Get all AI settings from the database"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT setting_key, setting_value FROM ai_settings")
        rows = await cur.fetchall()
        return {row["setting_key"]: row["setting_value"] for row in rows}


# =============================================================================
# CONVERSATION DATABASE HELPERS
# =============================================================================

async def _get_conversation(conn: AsyncConnection, conversation_id: str) -> Optional[dict]:
    """Get a conversation from the database"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM ai_conversations WHERE conversation_id = %s",
            (conversation_id,)
        )
        return await cur.fetchone()


async def _save_conversation(
    conn: AsyncConnection,
    conversation_id: str,
    messages: list,
    user_id: Optional[str] = None,
    title: Optional[str] = None
) -> None:
    """Save or update a conversation in the database"""
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO ai_conversations (conversation_id, user_id, title, messages)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (conversation_id)
            DO UPDATE SET
                messages = EXCLUDED.messages,
                title = COALESCE(EXCLUDED.title, ai_conversations.title),
                updated_at = NOW()
            """,
            (conversation_id, user_id, title, json.dumps(messages))
        )


async def _get_user_conversations(conn: AsyncConnection, user_id: Optional[str] = None, limit: int = 20) -> list:
    """Get recent conversations for a user"""
    async with conn.cursor(row_factory=dict_row) as cur:
        if user_id:
            await cur.execute(
                """
                SELECT id, conversation_id, title, created_at, updated_at
                FROM ai_conversations
                WHERE user_id = %s
                ORDER BY updated_at DESC
                LIMIT %s
                """,
                (user_id, limit)
            )
        else:
            await cur.execute(
                """
                SELECT id, conversation_id, title, created_at, updated_at
                FROM ai_conversations
                ORDER BY updated_at DESC
                LIMIT %s
                """,
                (limit,)
            )
        return await cur.fetchall()


# =============================================================================
# SETTINGS ENDPOINTS
# =============================================================================

@router.get("/settings", response_model=AISettings)
async def get_ai_settings(conn: AsyncConnection = Depends(connection)):
    """Get current AI settings (API key is masked)"""
    settings = await _get_all_settings(conn)
    return AISettings(
        provider=settings.get("provider", "anthropic"),
        model=settings.get("model", "claude-sonnet-4-20250514"),
        api_key="****" if settings.get("api_key") else None,
    )


@router.put("/settings", response_model=AISettings)
async def update_ai_settings(settings: AISettingsUpdate, conn: AsyncConnection = Depends(connection)):
    """Update AI settings"""
    if settings.provider is not None:
        await _set_setting(conn, "provider", settings.provider)
    if settings.model is not None:
        await _set_setting(conn, "model", settings.model)
    if settings.api_key is not None:
        await _set_setting(conn, "api_key", settings.api_key)

    current = await _get_all_settings(conn)
    return AISettings(
        provider=current.get("provider", "anthropic"),
        model=current.get("model", "claude-sonnet-4-20250514"),
        api_key="****" if current.get("api_key") else None,
    )


@router.post("/test-connection")
async def test_ai_connection(conn: AsyncConnection = Depends(connection)):
    """Test the AI connection with current settings"""
    settings = await _get_all_settings(conn)
    api_key = settings.get("api_key")

    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")

    provider = settings.get("provider", "anthropic")
    model = settings.get("model", "claude-sonnet-4-20250514")

    try:
        if provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            response = client.messages.create(
                model=model,
                max_tokens=50,
                messages=[{"role": "user", "content": "Say 'Connection successful' in exactly those words."}]
            )
            return {"status": "success", "message": "Connected to Anthropic API"}

        elif provider == "openai":
            import openai
            client = openai.OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model=model,
                max_tokens=50,
                messages=[{"role": "user", "content": "Say 'Connection successful' in exactly those words."}]
            )
            return {"status": "success", "message": "Connected to OpenAI API"}

        else:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")


@router.get("/mcp/health")
async def check_mcp_health():
    """Check MCP server health"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{MCP_POSTGRES_URL}/health", timeout=5.0)
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"MCP server unavailable: {str(e)}")


@router.get("/mcp/resources")
async def list_mcp_resources():
    """List available database resources from MCP"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{MCP_POSTGRES_URL}/resources", timeout=10.0)
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"MCP server error: {str(e)}")


# =============================================================================
# DATABASE SCHEMA FOR AI CONTEXT
# =============================================================================

SYSTEM_PROMPT = """You are an AI assistant for an AML (Anti-Money Laundering) compliance platform.
You help compliance officers analyze their data by answering questions in natural language.

You have access to a PostgreSQL database via MCP (Model Context Protocol) with these tables:

1. customers - Customer records with risk information
   - id (UUID), member_id, first_name, last_name, full_name, email, phone_number
   - birth_date, identity_number, place_of_birth, country_of_birth
   - address fields (county, city, street, house_number)
   - employer_name, status (PENDING, ACTIVE, SUSPENDED, CLOSED)
   - risk_score (0-100), risk_level (low, medium, high, critical)
   - pep_flag, sanctions_hit (booleans)
   - geography_risk, product_risk, behavior_risk (1-10 scale)
   - created_at

2. transactions - Financial transactions
   - id, surrogate_id, customer_id (UUID FK)
   - person_first_name, person_last_name, vendor_name
   - amount, original_transaction_amount
   - price_number_of_months, grace_number_of_months
   - client_settlement_status, vendor_settlement_status
   - transaction_delivery_status, transaction_financial_status
   - created_at

3. alerts - Compliance alerts
   - id, customer_id (UUID FK)
   - type, status (open, resolved), severity (low, medium, high, critical)
   - scenario (e.g., CASH_OVER_10K_EUR)
   - details (JSONB), created_at, resolved_at

4. tasks - Investigation tasks
   - id, customer_id (UUID), alert_id (FK)
   - task_type (investigation, kyc_refresh, document_request, escalation, sar_filing)
   - priority (low, medium, high, critical), status (pending, in_progress, completed)
   - title, description, due_date
   - assigned_to (UUID), claimed_by_id (UUID)
   - created_at, completed_at

5. users - System users
   - id (UUID), email, full_name, role (analyst, senior_analyst, manager, admin)
   - is_active, created_at

You also have access to a calculator tool for mathematical operations.
Supported functions: round(x, decimals), floor(x), ceil(x), abs(x), sqrt(x), pow(x, y), min(x, y), max(x, y)
Example expressions: "15000 * 0.05", "round(66.6666, 2)", "sqrt(144)", "pow(2, 10)"

When you need to query the database, respond with a JSON object:
{
    "tool": "query",
    "sql_query": "SELECT ... (your SQL query)",
    "explanation": "Brief explanation of what you're looking for"
}

When you need to calculate something, respond with a JSON object:
{
    "tool": "calculate",
    "expression": "mathematical expression (e.g., 1500 * 0.05 + 200)",
    "explanation": "Brief explanation of the calculation"
}

When you don't need any tool:
{
    "tool": "none",
    "explanation": "Your response to the user"
}

Rules:
- Only use SELECT statements for database queries
- Limit results to 50 rows unless asked for more
- Use clear column aliases
- Format dates nicely
- Use the calculator for percentage calculations, totals, averages, etc.
- Be concise but helpful
"""


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _extract_text_response(response: str) -> str:
    """Extract plain text from AI response, handling JSON and markdown code blocks"""
    response = response.strip()

    # Remove markdown code blocks if present
    if response.startswith("```"):
        lines = response.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        response = "\n".join(lines)

    # Try to parse as JSON and extract explanation
    try:
        parsed = json.loads(response)
        if isinstance(parsed, dict) and "explanation" in parsed:
            return parsed["explanation"]
    except json.JSONDecodeError:
        pass

    return response


# =============================================================================
# CHAT ENDPOINT
# =============================================================================

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, conn: AsyncConnection = Depends(connection)):
    """Send a message to the AI assistant"""
    settings = await _get_all_settings(conn)

    if not settings.get("api_key"):
        raise HTTPException(
            status_code=400,
            detail="AI not configured. Please set your API key in Settings > AI Assistant."
        )

    conversation_id = request.conversation_id or f"conv_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    # Get existing conversation from database or start new one
    conv_record = await _get_conversation(conn, conversation_id)
    if conv_record:
        conversation = conv_record["messages"] if isinstance(conv_record["messages"], list) else json.loads(conv_record["messages"])
    else:
        conversation = []

    conversation.append({"role": "user", "content": request.message})

    try:
        # Call the AI
        ai_response = await _call_ai(conversation, settings)

        sql_query = None
        query_results = None
        final_response = ai_response

        # Try to parse as JSON (handle markdown code blocks)
        try:
            json_str = ai_response.strip()
            # Remove markdown code blocks if present
            if json_str.startswith("```"):
                lines = json_str.split("\n")
                # Remove first line (```json or ```) and last line (```)
                lines = [l for l in lines if not l.strip().startswith("```")]
                json_str = "\n".join(lines)

            parsed = json.loads(json_str)
            if isinstance(parsed, dict):
                tool = parsed.get("tool", "").lower()

                # Handle database query tool
                if tool == "query" or (parsed.get("needs_query") and parsed.get("sql_query")):
                    sql_query = parsed.get("sql_query")
                    if sql_query:
                        # Execute via MCP
                        query_results = await _execute_mcp_query(sql_query)

                        # Get AI to analyze the results
                        analysis_prompt = f"""Query results:
{json.dumps(query_results, default=str, indent=2)}

Analyze these results and provide a helpful summary for the compliance officer."""

                        conversation.append({"role": "assistant", "content": ai_response})
                        conversation.append({"role": "user", "content": analysis_prompt})

                        analysis_response = await _call_ai(conversation, settings)
                        final_response = _extract_text_response(analysis_response)

                # Handle calculator tool
                elif tool == "calculate" and parsed.get("expression"):
                    expression = parsed["expression"]
                    calc_result = await _execute_calculation(expression)

                    # Get AI to explain the result
                    analysis_prompt = f"""Calculation result:
Expression: {expression}
Result: {calc_result.get('result')} ({calc_result.get('formatted')})

Explain this result in the context of the user's question."""

                    conversation.append({"role": "assistant", "content": ai_response})
                    conversation.append({"role": "user", "content": analysis_prompt})

                    analysis_response = await _call_ai(conversation, settings)
                    final_response = _extract_text_response(analysis_response)
                    query_results = [calc_result]

                # No tool needed
                else:
                    final_response = parsed.get("explanation", ai_response)
        except json.JSONDecodeError:
            pass

        conversation.append({"role": "assistant", "content": final_response})

        # Keep conversation manageable (last 20 messages)
        if len(conversation) > 20:
            conversation = conversation[-20:]

        # Generate title from first user message if new conversation
        title = None
        if not conv_record:
            first_msg = request.message[:100] + "..." if len(request.message) > 100 else request.message
            title = first_msg

        # Save conversation to database
        await _save_conversation(conn, conversation_id, conversation, user_id=None, title=title)

        return ChatResponse(
            response=final_response,
            sql_query=sql_query,
            query_results=query_results,
            conversation_id=conversation_id,
        )

    except Exception as e:
        import traceback
        print(f"AI Chat Error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


async def _call_ai(conversation: list, settings: dict) -> str:
    """Call the AI provider with the conversation"""
    provider = settings.get("provider", "anthropic")
    model = settings.get("model", "claude-sonnet-4-20250514")
    api_key = settings.get("api_key")

    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        response = client.messages.create(
            model=model,
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            messages=conversation,
        )
        return response.content[0].text

    elif provider == "openai":
        import openai
        client = openai.OpenAI(api_key=api_key)

        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + conversation
        response = client.chat.completions.create(
            model=model,
            max_tokens=2000,
            messages=messages,
        )
        return response.choices[0].message.content

    else:
        raise ValueError(f"Unknown provider: {provider}")


async def _execute_mcp_query(sql: str) -> list:
    """Execute a query via MCP server"""
    import re

    # Safety check
    sql_upper = sql.upper().strip()
    if not sql_upper.startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed")

    # Check for dangerous keywords as whole words (not substrings like 'created_at')
    dangerous = ["INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE", "GRANT"]
    for keyword in dangerous:
        # Use word boundary to avoid matching 'created_at' for 'CREATE'
        if re.search(rf'\b{keyword}\b', sql_upper):
            raise ValueError(f"Query contains forbidden keyword: {keyword}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{MCP_POSTGRES_URL}/query",
                json={"sql": sql},
                timeout=30.0
            )

            if response.status_code != 200:
                error_data = response.json()
                raise ValueError(error_data.get("error", "MCP query failed"))

            result = response.json()

            # MCP returns results in content array
            if isinstance(result, dict) and "content" in result:
                for item in result["content"]:
                    if item.get("type") == "text":
                        # Parse the text content as JSON or return as-is
                        try:
                            return json.loads(item["text"])
                        except:
                            return [{"result": item["text"]}]

            return result if isinstance(result, list) else [result]

    except httpx.RequestError as e:
        raise ValueError(f"MCP server connection error: {str(e)}")


async def _execute_calculation(expression: str) -> dict:
    """Execute a calculation via MCP server"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{MCP_POSTGRES_URL}/calculate",
                json={"expression": expression},
                timeout=10.0
            )

            if response.status_code != 200:
                error_data = response.json()
                raise ValueError(error_data.get("error", "Calculation failed"))

            return response.json()

    except httpx.RequestError as e:
        raise ValueError(f"MCP server connection error: {str(e)}")


# =============================================================================
# CONVERSATION MANAGEMENT
# =============================================================================

@router.get("/conversations")
async def list_conversations(limit: int = 20, conn: AsyncConnection = Depends(connection)):
    """List recent conversations"""
    conversations = await _get_user_conversations(conn, limit=limit)
    return {"conversations": [dict(c) for c in conversations]}


@router.get("/conversations/{conversation_id}")
async def get_conversation_history(conversation_id: str, conn: AsyncConnection = Depends(connection)):
    """Get a specific conversation's messages"""
    conv = await _get_conversation(conn, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "conversation_id": conv["conversation_id"],
        "title": conv["title"],
        "messages": conv["messages"] if isinstance(conv["messages"], list) else json.loads(conv["messages"]),
        "created_at": conv["created_at"],
        "updated_at": conv["updated_at"]
    }


@router.delete("/conversations/{conversation_id}")
async def clear_conversation(conversation_id: str, conn: AsyncConnection = Depends(connection)):
    """Delete a conversation"""
    async with conn.cursor() as cur:
        await cur.execute(
            "DELETE FROM ai_conversations WHERE conversation_id = %s",
            (conversation_id,)
        )
    return {"status": "deleted"}


@router.post("/conversations/clear-all")
async def clear_all_conversations(conn: AsyncConnection = Depends(connection)):
    """Clear all conversation histories"""
    async with conn.cursor() as cur:
        await cur.execute("DELETE FROM ai_conversations")
    return {"status": "all cleared"}
