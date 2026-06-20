# Audit Workflow

Analyse statique de la suite de tests Playwright par un LLM local (Qwen).

---

## Commande

```bash
ai-agent audit [--scope all|specs|manual]
```

| Scope | Fichiers analysés |
|---|---|
| `all` *(défaut)* | config + utils + tous les specs |
| `specs` | specs générés uniquement |
| `manual` | specs manuels uniquement |

---

## Étapes

### 1. Préparation — `buildFilesContext()`

L'agent collecte les fichiers du projet et les assemble en un seul contexte texte :

- `playwright.config.ts` (max 150 lignes)
- `.gitignore` (max 100 lignes)
- Utilitaires `tests/utils/` : `consoleGuard`, `navigation`, `cookies`, `constants`, `filter-tester`, `pagination-tester`, `overlay-handler`
- Tous les fichiers `*.spec.ts` / `*.spec.js` trouvés récursivement dans `tests/` (max 250 lignes chacun, triés alphabétiquement)

Retourne `{ context: string, fileCount: number }`.

---

### 2. Analyse LLM — `auditTests(context)`

Le contexte est envoyé à **Qwen** (hébergé localement) via une API compatible OpenAI :

```
POST $OPENROUTER_BASE_URL/chat/completions
model: $ANTHROPIC_MODEL
```

Qwen reçoit le `AUDIT_SYSTEM_PROMPT` qui lui demande de jouer le rôle d'un ingénieur QA senior et d'auditer chaque fichier contre les règles suivantes :

**Règles — Fichiers spec**
- Imports : pas d'import direct depuis `@playwright/test` si un wrapper custom existe
- URLs : aucune URL codée en dur — toujours des routes relatives
- Navigation : pas de `waitForLoadState("networkidle")`, pas de `waitForTimeout()`
- Sélecteurs : préférer `getByTestId()`, jamais de sélecteurs CSS ou XPath
- Assertions : uniquement les assertions web-first (`toBeVisible`, `toHaveText`…)
- Anti-patterns : pas de `test.each`, pas de `Promise.race`, pas de `querySelectorAll`
- Guards : `test.skip()` pour les features absentes, jamais `throw new Error()`
- `beforeAll` : toujours `test.setTimeout()` en première ligne si navigation

**Règles — `playwright.config.ts`**
- `actionTimeout` et `navigationTimeout` définis
- `baseURL` via variable d'environnement (pas codée en dur)
- Bloc `webServer` présent
- Un seul reporter configuré

**Règles — `.gitignore`**
- `.env`, `playwright-report/`, `test-results/` présents

**Règles — Cohérence globale**
- Sources d'import mixtes détectées
- Stratégies de sélecteurs mixtes
- Formats `.js` / `.ts` mélangés

---

### 3. Rapport — `parseSummary(report)`

Le rapport LLM est parsé pour extraire le comptage final :

```
SUMMARY: N error(s), M warning(s) across Z file(s) checked
```

Chaque problème est formaté ainsi :

```
File: tests/redirects.spec.ts
Line: 17
Issue: URL codée en dur "http://localhost:3000/fr"
Reason: Casse la portabilité — utiliser une route relative avec baseURL
Severity: ERROR
```

| Severity | Signification |
|---|---|
| `ERROR` | Violation d'une règle stricte |
| `WARNING` | Recommandation ou problème de style |

Le rapport complet est affiché dans le terminal entre deux lignes de séparation `═══…═══`.

---

### 4. Exit

| Condition | Code de sortie |
|---|---|
| `errorCount == 0` | `exit(0)` — audit passé |
| `errorCount > 0` | `exit(1)` — pipeline CI bloqué |

---

## Résultat retourné

```ts
interface AuditResult {
  report: string        // rapport complet du LLM
  filesScanned: number  // nombre de fichiers spec analysés
  errorCount: number    // erreurs bloquantes
  warningCount: number  // avertissements non bloquants
}
```

---

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `cli.ts` | Point d'entrée, parsing des options |
| `workflows/auditTests.ts` | Orchestration du workflow |
| `llm/client.ts` | Appel à Qwen via `callClaude()` |
| `llm/prompts.ts` | `AUDIT_SYSTEM_PROMPT` + `buildAuditPrompt()` |
| `config.ts` | `OPENROUTER_BASE_URL`, `ANTHROPIC_MODEL` |
