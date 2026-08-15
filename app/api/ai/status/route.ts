// Server-only. GEMINI_API_KEY (no NEXT_PUBLIC_ prefix) never reaches
// the client bundle — this route is the only way the browser learns
// whether AI phrasing is available, via a boolean, never the key.
import { getAiProvider } from "@/lib/ai/provider";

export async function GET() {
  const provider = getAiProvider();
  return Response.json({ configured: provider.isConfigured(), provider: provider.name });
}
