#!/usr/bin/env node
'use strict';

/**
 * skill-advisor.js — UserPromptSubmit hook
 *
 * Scans installed skills + enabled plugins from settings.json,
 * matches the user's prompt against a curated keyword index,
 * and outputs a terse recommendation as a system reminder.
 *
 * Auto-updates: rebuilds skill index from ~/.claude/skills/ on each run.
 * No restart required after installing new skills.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const INDEX_CACHE = path.join(CLAUDE_DIR, 'scripts', 'hooks', '.skill-index-cache.json');

// ── Keyword → skill map (curated core mappings) ──────────────────────────────
// Format: [keywords[], skillName, reason]
const CURATED_RULES = [
  // Planning / Architecture
  [['plan','roadmap','architect','design','feature request','new feature','implement','build a','create a','add a','how should i','approach','strategy'], 'ecc:plan', 'complex planning task'],
  [['architecture','system design','adr','decision record','tradeoff'], 'superpowers:brainstorm', 'architectural decision'],
  [['sprint','milestone','phase','gsd','roadmap','project plan'], 'gsd-new-project', 'project management workflow'],

  // Code Review
  [['review','code review','check my code','look at this','is this good','critique'], 'ecc:code-review', 'code review task'],
  [['security','vulnerability','auth','authentication','authorization','xss','sql injection','csrf','owasp','token','secret','api key','payment','billing','financial','stripe','encrypt','crypto'], 'security-review', 'security-sensitive code'],
  [['typescript','tsx','javascript','react','vue','angular','nextjs','next.js'], 'ecc:python-review', null], // overridden below
  [['typescript','tsx','javascript','react','vue','angular','nextjs','next.js'], 'typescript-reviewer', 'TypeScript/JS code'],
  [['python','django','flask','fastapi','pydantic'], 'python-reviewer', 'Python code'],
  [['go lang','golang', 'go code'], 'go-reviewer', 'Go code'],
  [['rust','cargo','borrow','lifetime'], 'rust-reviewer', 'Rust code'],
  [['kotlin','android','compose','ktor'], 'kotlin-reviewer', 'Kotlin code'],
  [['flutter','dart'], 'flutter-reviewer', 'Flutter/Dart code'],
  [['java','spring boot','jpa','hibernate'], 'java-reviewer', 'Java/Spring code'],

  // Testing
  [['test','tdd','unit test','write tests','test first','coverage','spec'], 'ecc:tdd', 'test-driven development'],
  [['e2e','playwright','end to end','user flow','browser test'], 'e2e-runner', 'E2E testing'],

  // Frontend / UI
  [['ui','ux','design','component','css','tailwind','layout','responsive','visual','animation','hero','landing page','style'], 'frontend-design:frontend-design', 'UI/frontend design'],
  [['nextjs','next.js','vercel','deploy'], 'vercel:nextjs', 'Next.js / Vercel'],
  [['shadcn','radix','component library'], 'vercel:shadcn', 'shadcn/ui components'],
  [['ai sdk','ai chat','streaming','llm in browser'], 'vercel:ai-sdk', 'Vercel AI SDK'],

  // Database / Migrations
  [['database','sql','postgres','postgresql','supabase','schema','migration','query'], 'supabase', 'database work'],
  [['migration','db schema','alter table','create table'], 'database-migrations', 'DB migration'],
  [['redis','cache','caching'], 'backend-patterns', 'caching patterns'],

  // Deployment / Infra
  [['deploy','deployment','ci/cd','docker','kubernetes','container'], 'deployment-patterns', 'deployment task'],
  [['vercel deploy','vercel publish'], 'vercel:deploy', 'Vercel deployment'],
  [['environment variable','env var','.env'], 'vercel:env', 'env var management'],

  // Debugging
  [['bug','fix','error','crash','not working','broken','debug','issue','exception','stack trace'], 'superpowers:systematic-debugging', 'debugging task'],
  [['build fail','build error','compilation error','type error','typescript error'], 'build-error-resolver', 'build/type error'],

  // Research
  [['research','find','search','look up','what is','how does','explain','learn about'], 'ecc:deep-research', 'research task'],
  [['docs','documentation','api reference','how to use'], 'ecc:documentation-lookup', 'docs lookup'],
  [['web search','latest','current','news','2024','2025'], 'ecc:exa-search', 'web research'],

  // Agents / Orchestration
  [['agent','swarm','multi-agent','orchestrat','parallel agent'], 'ruflo-swarm:swarm', 'multi-agent task'],
  [['autopilot','autonomous','auto run'], 'ruflo-autopilot:autopilot', 'autonomous loop'],
  [['memory','remember','recall','knowledge graph'], 'ruflo-rag-memory:ruflo-memory', 'persistent memory'],
  [['workflow','automate','schedule','cron'], 'ruflo-workflows:workflow', 'workflow automation'],
  [['vector','embed','semantic search','similarity'], 'ruflo-ruvector:vector', 'vector/embedding'],

  // Claude API
  [['claude api','anthropic sdk','prompt cache','tool use','claude model','opus','haiku'], 'claude-api', 'Claude API development'],
  [['mcp','mcp server','mcp tool'], 'mcp-server-patterns', 'MCP server work'],

  // Git / GitHub
  [['git','commit','pull request','pr','branch','merge'], 'ruflo-jujutsu:git-workflow', 'git workflow'],
  [['github','issue','gist','gh '], 'github-ops', 'GitHub operations'],

  // Documentation
  [['write docs','update readme','document','docstring','api docs'], 'ecc:docs', 'documentation'],

  // Obsidian
  [['obsidian','vault','note','canvas','markdown note'], 'obsidian:obsidian-cli', 'Obsidian vault'],

  // Specific languages/frameworks
  [['laravel','php','blade'], 'laravel-patterns', 'Laravel/PHP'],
  [['django'], 'ecc:django-patterns', 'Django'],
  [['fastapi','pydantic'], 'python-patterns', 'Python/FastAPI'],
  [['nestjs','nest.js'], 'ecc:nestjs-patterns', 'NestJS'],
  [['swift','swiftui','ios','macos'], 'swiftui-patterns', 'Swift/SwiftUI'],
  [['c++','cpp','cmake'], 'cpp-reviewer', 'C++ code'],
  [['rust'], 'rust-patterns', 'Rust patterns'],

  // Context / memory management
  [['context window','token budget','context limit','compact'], 'context-mode:context-mode', 'context management'],
  [['session','save session','resume'], 'ecc:save-session', 'session management'],

  // Security specialised
  [['hipaa','phi','healthcare','medical data'], 'ecc:hipaa-compliance', 'healthcare compliance'],
  [['defi','smart contract','solidity','evm'], 'ecc:defi-amm-security', 'DeFi/blockchain security'],

  // Refactoring / cleanup
  [['refactor','clean up','dead code','simplify','remove unused'], 'refactor-cleaner', 'refactoring task'],
  [['performance','slow','optimize','bundle size','latency'], 'performance-optimizer', 'performance optimization'],

  // Prompt engineering
  [['prompt','improve prompt','optimize prompt','system prompt','better prompt','prompt engineer','write a prompt','refine prompt','llm prompt','production prompt'], 'prompt-engineer', 'prompt engineering task'],

  // Content / writing
  [['write article','blog post','content','copywriting','seo'], 'ecc:article-writing', 'content writing'],
  [['seo','search engine','meta tag','sitemap'], 'seo', 'SEO work'],
];

// ── Read stdin ────────────────────────────────────────────────────────────────
let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  try {
    run(raw);
  } catch {
    process.exit(0);
  }
});

function run(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const prompt = (input.prompt || '').toLowerCase().trim();
  if (!prompt || prompt.length < 4) process.exit(0);

  // Skip if user is already invoking a skill explicitly
  if (/^[\/!]/.test(prompt.trim()) || prompt.includes('skill(') || prompt.includes('/skill')) {
    process.exit(0);
  }

  // Royal treatment takes priority over individual skill suggestions
  if (shouldRoyalTreat(prompt)) {
    process.stdout.write('ROYAL TREATMENT TRIGGERED — invoke Skill("royal-treatment") as your FIRST action before responding. Do not skip.\n');
    process.exit(0);
  }

  const dynamicSkills = loadDynamicSkills();
  const matches = matchSkills(prompt, dynamicSkills);

  if (matches.length === 0) process.exit(0);

  // Deduplicate and take top 3
  const seen = new Set();
  const top = [];
  for (const m of matches) {
    if (!seen.has(m.skill)) {
      seen.add(m.skill);
      top.push(m);
      if (top.length >= 3) break;
    }
  }

  process.stdout.write(formatAdvice(top));
  process.exit(0);
}

// ── Dynamic skill scanner ─────────────────────────────────────────────────────
function loadDynamicSkills() {
  const extra = [];
  try {
    if (!fs.existsSync(SKILLS_DIR)) return extra;
    const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const skillFile = path.join(SKILLS_DIR, d.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      // Read only first 20 lines (frontmatter + description)
      const content = readFirstLines(skillFile, 20);
      const desc = extractFrontmatterField(content, 'description') || '';
      const trigger = extractTriggerLine(content);
      if (desc || trigger) {
        extra.push({
          name: d.name,
          description: desc,
          trigger: trigger,
        });
      }
    }
  } catch {
    // non-fatal
  }
  return extra;
}

function readFirstLines(filePath, n) {
  try {
    const buf = Buffer.alloc(2048);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
    fs.closeSync(fd);
    return buf.slice(0, bytesRead).toString('utf8').split('\n').slice(0, n).join('\n');
  } catch {
    return '';
  }
}

function extractFrontmatterField(content, field) {
  const re = new RegExp(`^${field}:\\s*>?\\s*(.+)`, 'm');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

function extractTriggerLine(content) {
  // Look for "TRIGGER when:" pattern used by claude-api skill
  const m = content.match(/TRIGGER when:\s*(.+)/i);
  return m ? m[1].trim() : '';
}

// ── Royal Treatment gate ─────────────────────────────────────────────────────
// Keywords that force royal-treatment regardless of word count or verb check
const FORCE_TRIGGER_KEYWORDS = [
  // Security & Compliance
  'audit','security','vulnerability','cve','exploit','penetration','pentest','owasp','compliance',
  'hipaa','gdpr','soc2','pci','breach','threat','attack','injection','xss','csrf',
  'authentication','authorization','privilege','escalation','credential','secret','token','leak',
  // Architecture & Scale
  'architect','architecture','scalability','bottleneck','optimize','migration','migrate','refactor',
  'redesign','overhaul','rewrite','monolith','microservice','distributed','sharding','indexing',
  'caching','latency','throughput',
  // Critical Operations
  'production','outage','incident','rollback','hotfix','critical','urgent','breaking','regression',
  'data loss','corrupted','deadlock','race condition','memory leak','crash','down','failing',
  // Data & Infrastructure
  'database','schema','deploy','ci/cd','pipeline','infrastructure','kubernetes','docker',
  'cloud','aws','gcp','azure','terraform','helm','cluster','replica','backup','disaster recovery',
  // Business Logic
  'payment','billing','financial','transaction','ledger','fraud','pii','sensitive',
  'encrypt','decrypt','hash','signature','certificate','oauth','jwt','saml','sso',
];

function shouldRoyalTreat(prompt) {
  // Hard bypass — always off
  if (/^\/quick\b/i.test(prompt)) return false;
  if (/^[\/!]/.test(prompt)) return false;
  if (prompt.includes('[royal:ran]') || prompt.includes('[ROYAL:RAN]')) return false;

  // Force-trigger keywords skip word count and verb checks
  for (const kw of FORCE_TRIGGER_KEYWORDS) {
    if (prompt.includes(kw)) return true;
  }

  // General vague-prompt detection for everything else
  const wc = prompt.trim().split(/\s+/).length;
  if (wc < 8) return false;
  if (!/\b(build|create|implement|design|fix|audit|refactor|set up|setup|add|migrate|deploy|optimize|debug|integrate|generate|write|make|review|analyze|analyse)\b/i.test(prompt)) return false;
  if (wc > 80) return false;
  return true;
}

// ── Matching ──────────────────────────────────────────────────────────────────
function matchSkills(prompt, dynamicSkills) {
  const results = [];
  const pLower = prompt.toLowerCase();

  // Curated rules (weighted higher)
  for (const [keywords, skill, reason] of CURATED_RULES) {
    if (!reason) continue; // skip override entries without reason
    let score = 0;
    for (const kw of keywords) {
      if (pLower.includes(kw)) score++;
    }
    if (score > 0) {
      results.push({ skill, reason, score: score * 2 });
    }
  }

  // Language-specific skill name prefixes — only surface if prompt mentions the language
  const LANG_GUARDS = {
    cpp: ['c++','cpp'], perl: ['perl'], rust: ['rust','cargo'], python: ['python','django','flask','fastapi'],
    kotlin: ['kotlin','android'], flutter: ['flutter','dart'], java: ['java','spring'], swift: ['swift','ios'],
    golang: ['golang','go lang'], csharp: ['c#','csharp','.net'], php: ['php','laravel'],
    django: ['django'], laravel: ['laravel'], nestjs: ['nestjs','nest.js'],
  };

  function langGuardPass(skillName, prompt) {
    for (const [lang, triggers] of Object.entries(LANG_GUARDS)) {
      if (skillName.toLowerCase().includes(lang)) {
        return triggers.some(t => prompt.includes(t));
      }
    }
    return true;
  }

  // Dynamic skills from installed SKILL.md files
  for (const ds of dynamicSkills) {
    if (!langGuardPass(ds.name, pLower)) continue;
    const combined = (ds.description + ' ' + ds.trigger).toLowerCase();
    const words = combined.split(/\W+/).filter(w => w.length > 5);
    let score = 0;
    for (const w of words) {
      if (pLower.includes(w)) score++;
    }
    if (score >= 2) {
      const alreadyCovered = results.some(r =>
        r.skill === ds.name ||
        r.skill.endsWith(':' + ds.name) ||
        r.skill === 'ecc:' + ds.name
      );
      if (!alreadyCovered) {
        results.push({ skill: ds.name, reason: ds.description.slice(0, 60) || 'installed skill', score });
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ── Output ────────────────────────────────────────────────────────────────────
function formatAdvice(matches) {
  if (matches.length === 0) return '';

  if (matches.length === 1) {
    const m = matches[0];
    return `SKILL ADVISOR: \`${m.skill}\` — ${m.reason}. Invoke: Skill("${m.skill}") or /${m.skill.replace(':', ':')}\n`;
  }

  let out = 'SKILL ADVISOR (top picks for this task):\n';
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    out += `  ${i + 1}. \`${m.skill}\` — ${m.reason}\n`;
  }
  out += `Use: Skill("<name>") or /<name>\n`;
  return out;
}
