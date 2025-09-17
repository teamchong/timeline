#!/usr/bin/env bun

import { join } from 'path';
import { marked } from 'marked';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationEntry {
  type: 'user' | 'assistant' | 'summary';
  message?: Message;
  summary?: string;
  timestamp?: string;
  uuid?: string;
  toolUse?: any;
}

async function loadConversation(sessionId: string): Promise<ConversationEntry[]> {
  const projectDir =
    process.env.HOME + '/.claude/projects/-Users-steven-chong-Downloads-repos-timeline';
  const filePath = join(projectDir, `${sessionId}.jsonl`);

  try {
    const content = await Bun.file(filePath).text();
    const lines = content.trim().split('\n');
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    console.error(`Failed to load session ${sessionId}:`, error);
    return [];
  }
}

function renderMessage(entry: ConversationEntry): string {
  if (entry.type === 'summary') {
    return `<div class="summary bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
      <h3 class="font-bold text-blue-700">Session Summary</h3>
      <p class="text-gray-700">${entry.summary || 'No summary available'}</p>
    </div>`;
  }

  if (entry.message) {
    const role = entry.message.role;
    const isUser = role === 'user';
    const bgColor = isUser ? 'bg-gray-50' : 'bg-green-50';
    const borderColor = isUser ? 'border-gray-300' : 'border-green-300';
    const roleLabel = isUser ? 'User' : 'Assistant';

    // Parse content - handle special tags
    let content = '';

    if (Array.isArray(entry.message.content)) {
      // Handle array format (assistant messages)
      content = entry.message.content
        .filter((item: any) => typeof item === 'string' || item.type === 'text')
        .map((item: any) => (typeof item === 'string' ? item : item.text || ''))
        .join('');
    } else if (typeof entry.message.content === 'string') {
      content = entry.message.content;
    }

    // Remove command tags
    content = content.replace(/<command-[^>]+>.*?<\/command-[^>]+>/gs, '');

    // Convert markdown to HTML
    const htmlContent = marked.parse(content, { breaks: true, gfm: true });

    return `<div class="message ${bgColor} border-l-4 ${borderColor} p-4 mb-4">
      <div class="flex justify-between items-start mb-2">
        <span class="font-semibold text-sm ${isUser ? 'text-gray-600' : 'text-green-600'}">${roleLabel}</span>
        ${entry.timestamp ? `<span class="text-xs text-gray-500">${new Date(entry.timestamp).toLocaleString()}</span>` : ''}
      </div>
      <div class="prose prose-sm max-w-none message-content">
        ${htmlContent}
      </div>
    </div>`;
  }

  return '';
}

function generateConversationHTML(entries: ConversationEntry[], sessionId: string): string {
  const messages = entries
    .filter(e => e.type === 'summary' || e.message)
    .map(renderMessage)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conversation: ${sessionId}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js"></script>
    <style>
      .prose pre {
        background-color: #2d2d2d;
        color: #cccccc;
        padding: 1rem;
        border-radius: 0.375rem;
        overflow-x: auto;
      }
      .prose code {
        background-color: #f3f4f6;
        padding: 0.125rem 0.25rem;
        border-radius: 0.25rem;
        font-size: 0.875rem;
      }
      .prose pre code {
        background-color: transparent;
        padding: 0;
      }
      .message-content h1 { font-size: 1.5em; font-weight: bold; margin: 1em 0 0.5em; }
      .message-content h2 { font-size: 1.3em; font-weight: bold; margin: 1em 0 0.5em; }
      .message-content h3 { font-size: 1.1em; font-weight: bold; margin: 1em 0 0.5em; }
      .message-content ul { list-style-type: disc; margin-left: 1.5em; }
      .message-content ol { list-style-type: decimal; margin-left: 1.5em; }
      .message-content blockquote { border-left: 4px solid #e5e7eb; padding-left: 1em; color: #6b7280; }
    </style>
</head>
<body class="bg-gray-100 min-h-screen py-8">
    <div class="max-w-4xl mx-auto px-4">
        <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h1 class="text-2xl font-bold text-gray-800 mb-2">Conversation Viewer</h1>
            <p class="text-sm text-gray-600">Session: <code class="bg-gray-100 px-2 py-1 rounded">${sessionId}</code></p>
        </div>
        
        <div class="conversation-container">
            ${messages || '<p class="text-center text-gray-500">No messages in this conversation</p>'}
        </div>
    </div>
    
    <script>
      // Apply syntax highlighting
      document.addEventListener('DOMContentLoaded', () => {
        Prism.highlightAll();
      });
    </script>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: bun render-conversation.ts <session-id> [output-file]');
    process.exit(1);
  }

  const sessionId = args[0];
  const outputFile = args[1];

  console.log(`Loading conversation for session: ${sessionId}...`);
  const entries = await loadConversation(sessionId);

  if (entries.length === 0) {
    console.error('No conversation data found');
    process.exit(1);
  }

  console.log(`Found ${entries.length} entries`);
  const html = generateConversationHTML(entries, sessionId);

  if (outputFile) {
    await Bun.write(outputFile, html);
    console.log(`Conversation saved to: ${outputFile}`);
  } else {
    // Output to temp file and open
    const tempFile = `/tmp/conversation-${sessionId}.html`;
    await Bun.write(tempFile, html);
    console.log(`Opening conversation in browser...`);
    await Bun.spawn(['open', tempFile]);
  }
}

main().catch(console.error);
