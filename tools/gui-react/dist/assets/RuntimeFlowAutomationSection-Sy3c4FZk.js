import{r as u,j as e}from"./vendor-ui-ComJg1Ad.js";import{a5 as x,a9 as b,a7 as h,a6 as t,a8 as r,aa as p}from"./index-Coo0nacI.js";import"./vendor-react-yyJz49DP.js";import"./vendor-query-B32LnyU-.js";const o="Phase coverage: background control plane around the main 01-13 run lifecycle, not a single in-run stage.",j=u.memo(function({runtimeDraft:i,runtimeSettingsReady:s,inputCls:a,runtimeSubStepDomId:m,updateDraft:c,onNumberChange:n,getNumberBounds:d}){return e.jsxs(e.Fragment,{children:[e.jsx("div",{id:m("automation-drift"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Drift Detection",children:[e.jsx(b,{label:"Drift Detection Enabled",tip:`${o}
Lives in: post-run drift monitoring.
What this controls: whether the background drift scanner is allowed to look for stale or changed products outside the active run.`,hint:"Controls drift scanning and auto-republish settings below.",children:e.jsx(h,{checked:i.driftDetectionEnabled,onChange:l=>c("driftDetectionEnabled",l),disabled:!s})}),e.jsx(t,{label:"Drift Poll Seconds",tip:`${o}
Lives in: drift scanner scheduling.
What this controls: the polling interval between drift detection cycles.`,children:e.jsx(r,{draftKey:"driftPollSeconds",value:i.driftPollSeconds,bounds:d("driftPollSeconds"),step:60,disabled:!s,className:a,onNumberChange:n})}),e.jsx(t,{label:"Drift Scan Max Products",tip:`${o}
Lives in: drift scanner batch sizing.
What this controls: how many products a single drift cycle may inspect.`,children:e.jsx(r,{draftKey:"driftScanMaxProducts",value:i.driftScanMaxProducts,bounds:d("driftScanMaxProducts"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsxs(p,{title:"Advanced Drift Settings",count:2,children:[e.jsx(t,{label:"Drift Auto Republish",tip:`${o}
Lives in: drift remediation policy.
What this controls: whether a qualifying drift detection can trigger automatic republish behavior.`,children:e.jsx(h,{checked:i.driftAutoRepublish,onChange:l=>c("driftAutoRepublish",l),disabled:!s})}),e.jsx(t,{label:"Re-Crawl Stale After (days)",tip:`${o}
Lives in: stale-source maintenance policy.
What this controls: how many days a source may age before automation treats it as stale and eligible for recrawl.`,children:e.jsx(r,{draftKey:"reCrawlStaleAfterDays",value:i.reCrawlStaleAfterDays,bounds:d("reCrawlStaleAfterDays"),step:1,disabled:!s,className:a,onNumberChange:n})})]})]}),e.jsx("div",{id:m("automation-learning"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Self-Improvement",children:[e.jsx(b,{label:"Self Improve Enabled",tip:`${o}
Lives in: post-run learning and follow-up generation.
What this controls: whether the self-improvement loop may create hypotheses, follow-ups, and learning updates after runs complete.`,hint:"Controls learning confidence, hypothesis, and endpoint signal settings below.",children:e.jsx(h,{checked:i.selfImproveEnabled,onChange:l=>c("selfImproveEnabled",l),disabled:!s})}),e.jsx(t,{label:"Batch Strategy",tip:`${o}
Lives in: advanced learning/runtime orchestration.
What this controls: the batching strategy token used by higher-level automation logic.`,children:e.jsx("input",{type:"text",value:i.batchStrategy,onChange:l=>c("batchStrategy",l.target.value),disabled:!s,className:a})}),e.jsxs(p,{title:"Advanced Learning Settings",count:7,children:[e.jsx(t,{label:"Field Reward Half-Life (days)",tip:`${o}
Lives in: learning reward decay.
What this controls: how quickly historical field rewards lose influence over time.`,children:e.jsx(r,{draftKey:"fieldRewardHalfLifeDays",value:i.fieldRewardHalfLifeDays,bounds:d("fieldRewardHalfLifeDays"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(t,{label:"Max Hypothesis Items",tip:`${o}
Lives in: hypothesis queue sizing.
What this controls: the maximum number of hypothesis rows self-improve will consider in one pass.`,children:e.jsx(r,{draftKey:"maxHypothesisItems",value:i.maxHypothesisItems,bounds:d("maxHypothesisItems"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(t,{label:"Hypothesis Auto Followup Rounds",tip:`${o}
Lives in: hypothesis follow-up planning.
What this controls: how many automatic follow-up rounds the self-improvement loop may schedule.`,children:e.jsx(r,{draftKey:"hypothesisAutoFollowupRounds",value:i.hypothesisAutoFollowupRounds,bounds:d("hypothesisAutoFollowupRounds"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(t,{label:"Hypothesis Followup URLs / Round",tip:`${o}
Lives in: hypothesis follow-up budgeting.
What this controls: the URL budget consumed by each automatic follow-up round.`,children:e.jsx(r,{draftKey:"hypothesisFollowupUrlsPerRound",value:i.hypothesisFollowupUrlsPerRound,bounds:d("hypothesisFollowupUrlsPerRound"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(t,{label:"Endpoint Signal Limit",tip:`${o}
Lives in: endpoint mining and signal retention.
What this controls: how many endpoint signals a page scan may keep.`,children:e.jsx(r,{draftKey:"endpointSignalLimit",value:i.endpointSignalLimit,bounds:d("endpointSignalLimit"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(t,{label:"Endpoint Suggestion Limit",tip:`${o}
Lives in: endpoint suggestion promotion.
What this controls: how many endpoint suggestions may be promoted from the retained signals.`,children:e.jsx(r,{draftKey:"endpointSuggestionLimit",value:i.endpointSuggestionLimit,bounds:d("endpointSuggestionLimit"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(t,{label:"Endpoint Network Scan Limit",tip:`${o}
Lives in: endpoint signal scanning.
What this controls: the cap on network responses inspected while mining endpoint signals.`,children:e.jsx(r,{draftKey:"endpointNetworkScanLimit",value:i.endpointNetworkScanLimit,bounds:d("endpointNetworkScanLimit"),step:1,disabled:!s,className:a,onNumberChange:n})})]})]}),e.jsx("div",{id:m("automation-helper"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Helper Runtime",children:[e.jsx(b,{label:"Category Authority Enabled",tip:`${o}
Lives in: helper and authority-file substrate used beside the main runtime.
What this controls: whether category authority data and helper files are available to the automation layer.`,hint:"Controls all helper file runtime settings below.",children:e.jsx(h,{checked:i.categoryAuthorityEnabled,onChange:l=>c("categoryAuthorityEnabled",l),disabled:!s})}),e.jsx(t,{label:"Helper Files Root",tip:`${o}
Lives in: helper runtime file resolution.
What this controls: the root directory used to load helper files.`,children:e.jsx("input",{type:"text",value:i.helperFilesRoot,onChange:l=>c("helperFilesRoot",l.target.value),disabled:!s,className:a})}),e.jsx(t,{label:"Category Authority Root",tip:`${o}
Lives in: category authority file resolution.
What this controls: the root directory for category authority data files.`,children:e.jsx("input",{type:"text",value:i.categoryAuthorityRoot,onChange:l=>c("categoryAuthorityRoot",l.target.value),disabled:!s,className:a})}),e.jsx(p,{title:"Advanced Helper Settings",count:1,children:e.jsx(t,{label:"Helper Supportive Fill Missing",tip:`${o}
Lives in: helper supportive-fill policy.
What this controls: whether helper logic may fill missing values when running in supportive mode.`,children:e.jsx(h,{checked:i.helperSupportiveFillMissing,onChange:l=>c("helperSupportiveFillMissing",l),disabled:!s})})})]}),e.jsx("div",{id:m("automation-operations"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Operations",children:[e.jsx(t,{label:"Daemon Concurrency",tip:`${o}
Lives in: daemon orchestration.
What this controls: how many product runs daemon mode may execute concurrently.`,children:e.jsx(r,{draftKey:"daemonConcurrency",value:i.daemonConcurrency,bounds:d("daemonConcurrency"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsxs(p,{title:"Resume & Validation",count:4,children:[e.jsx(t,{label:"Indexing Resume Seed Limit",tip:`${o}
Lives in: daemon and resume bootstrap.
What this controls: the maximum number of seed URLs loaded when resuming prior work.`,children:e.jsx(r,{draftKey:"indexingResumeSeedLimit",value:i.indexingResumeSeedLimit,bounds:d("indexingResumeSeedLimit"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(t,{label:"Indexing Resume Persist Limit",tip:`${o}
Lives in: daemon and resume bootstrap.
What this controls: the maximum number of persisted items loaded while reconstructing resume state.`,children:e.jsx(r,{draftKey:"indexingResumePersistLimit",value:i.indexingResumePersistLimit,bounds:d("indexingResumePersistLimit"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(t,{label:"Indexing Schema Validation Enabled",tip:`${o}
Lives in: runtime payload guardrails.
What this controls: whether indexing payloads are validated against schema packets.`,children:e.jsx(h,{checked:i.indexingSchemaPacketsValidationEnabled,onChange:l=>c("indexingSchemaPacketsValidationEnabled",l),disabled:!s})}),e.jsx(t,{label:"Indexing Schema Validation Strict",tip:`${o}
Lives in: runtime payload guardrails.
What this controls: whether schema validation failures should hard-fail instead of being tolerated.`,children:e.jsx(h,{checked:i.indexingSchemaPacketsValidationStrict,onChange:l=>c("indexingSchemaPacketsValidationStrict",l),disabled:!s})})]}),e.jsxs(p,{title:"Import Watcher",count:2,children:[e.jsx(t,{label:"Imports Root",tip:`${o}
Lives in: daemon import watcher.
What this controls: the directory monitored for inbound imports.`,children:e.jsx("input",{type:"text",value:i.importsRoot,onChange:l=>c("importsRoot",l.target.value),disabled:!s,className:a})}),e.jsx(t,{label:"Imports Poll Seconds",tip:`${o}
Lives in: daemon import watcher scheduling.
What this controls: how often the import watcher polls for new work.`,children:e.jsx(r,{draftKey:"importsPollSeconds",value:i.importsPollSeconds,bounds:d("importsPollSeconds"),step:1,disabled:!s,className:a,onNumberChange:n})})]})]})]})});export{j as RuntimeFlowAutomationSection};
