import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, endpoint, apiKey, model } = body;

    if (!endpoint || !apiKey) {
      return NextResponse.json(
        { error: 'Missing endpoint or API key' },
        { status: 400 }
      );
    }

    const trimmedEndpoint = endpoint.trim();
    const trimmedApiKey = apiKey.trim();
    const trimmedModel = model ? model.trim() : '';

    const isGeminiNative = trimmedEndpoint.includes('generativelanguage.googleapis.com') || trimmedEndpoint.includes('generateContent');

    let finalUrl = trimmedEndpoint;
    let requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    let requestBody: any = {};

    if (isGeminiNative) {
      // 1. Genuinely parse Gemini query parameters to avoid corruption
      let baseUrlPath = trimmedEndpoint;
      let queryParams = '';
      if (trimmedEndpoint.includes('?')) {
        const parts = trimmedEndpoint.split('?');
        baseUrlPath = parts[0];
        queryParams = parts[1];
      }

      baseUrlPath = baseUrlPath.replace(/\/+$/, '');

      // Ensure v1beta path layout is formatted
      if (!baseUrlPath.includes('/models/') && trimmedModel) {
        if (!baseUrlPath.includes('/v1')) {
          baseUrlPath += '/v1beta';
        }
        baseUrlPath += `/models/${trimmedModel}`;
      }

      // Append generateContent call suffix if absent
      if (!baseUrlPath.endsWith(':generateContent')) {
        baseUrlPath += ':generateContent';
      }

      // Setup unified query key
      const params = new URLSearchParams(queryParams);
      if (!params.has('key')) {
        params.set('key', trimmedApiKey);
      }

      finalUrl = `${baseUrlPath}?${params.toString()}`;
      requestHeaders['X-goog-api-key'] = trimmedApiKey;

      // Map OpenAI messages payload schema directly to Gemini schema
      const contents = messages.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      requestBody = { contents };
    } else {
      // Standard OpenAI compatible design format
      if (!trimmedEndpoint.endsWith('/chat/completions')) {
        if (trimmedEndpoint.endsWith('/')) {
          finalUrl = `${trimmedEndpoint}chat/completions`;
        } else {
          finalUrl = `${trimmedEndpoint}/chat/completions`;
        }
      }

      requestHeaders['Authorization'] = `Bearer ${trimmedApiKey}`;
      requestBody = {
        model: trimmedModel || 'gpt-4o',
        messages: messages,
        stream: false,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `LLM API Error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
