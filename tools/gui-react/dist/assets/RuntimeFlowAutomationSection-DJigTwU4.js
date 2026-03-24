import{r as v,j as e}from"./vendor-ui-ComJg1Ad.js";import{ar as x,au as g,at as h,as as o,av as d,aw as p}from"./index-uz6dNosr.js";import"./vendor-react-yyJz49DP.js";import"./vendor-query-B32LnyU-.js";const t="Phase coverage: background control plane around the main 01-13 run lifecycle, not a single in-run stage.",w=v.memo(function({runtimeDraft:i,runtimeSettingsReady:s,inputCls:a,runtimeSubStepDomId:m,updateDraft:c,onNumberChange:n,getNumberBounds:r}){return e.jsxs(e.Fragment,{children:[e.jsx("div",{id:m("automation-drift"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Drift Detection",children:[e.jsx(g,{label:"Drift Detection Enabled",tip:`${t}
Lives in: post-run drift monitoring.
What this controls: whether the background drift scanner is allowed to look for stale or changed products outside the active run.`,hint:"Controls drift scanning and auto-republish settings below.",children:e.jsx(h,{checked:i.driftDetectionEnabled,onChange:l=>c("driftDetectionEnabled",l),disabled:!s})}),e.jsx(o,{label:"Drift Poll Seconds",tip:`${t}
Lives in: drift scanner scheduling.
What this controls: the polling interval between drift detection cycles.`,children:e.jsx(d,{draftKey:"driftPollSeconds",value:i.driftPollSeconds,bounds:r("driftPollSeconds"),step:60,disabled:!s,className:a,onNumberChange:n})}),e.jsx(o,{label:"Drift Scan Max Products",tip:`${t}
Lives in: drift scanner batch sizing.
What this controls: how many products a single drift cycle may inspect.`,children:e.jsx(d,{draftKey:"driftScanMaxProducts",value:i.driftScanMaxProducts,bounds:r("driftScanMaxProducts"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsxs(p,{title:"Advanced Drift Settings",count:2,children:[e.jsx(o,{label:"Drift Auto Republish",tip:`${t}
Lives in: drift remediation policy.
What this controls: whether a qualifying drift detection can trigger automatic republish behavior.`,children:e.jsx(h,{checked:i.driftAutoRepublish,onChange:l=>c("driftAutoRepublish",l),disabled:!s})}),e.jsx(o,{label:"Re-Crawl Stale After (days)",tip:`${t}
Lives in: stale-source maintenance policy.
What this controls: how many days a source may age before automation treats it as stale and eligible for recrawl.`,children:e.jsx(d,{draftKey:"reCrawlStaleAfterDays",value:i.reCrawlStaleAfterDays,bounds:r("reCrawlStaleAfterDays"),step:1,disabled:!s,className:a,onNumberChange:n})})]})]}),e.jsx("div",{id:m("automation-learning"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Self-Improvement",children:[e.jsx(g,{label:"Self Improve Enabled",tip:`${t}
Lives in: post-run learning and follow-up generation.
What this controls: whether the self-improvement loop may create hypotheses, follow-ups, and learning updates after runs complete.`,hint:"Controls learning confidence, hypothesis, and endpoint signal settings below.",children:e.jsx(h,{checked:i.selfImproveEnabled,onChange:l=>c("selfImproveEnabled",l),disabled:!s})}),e.jsx(o,{label:"Batch Strategy",tip:`${t}
Lives in: advanced learning/runtime orchestration.
What this controls: the batching strategy token used by higher-level automation logic.`,children:e.jsx("input",{type:"text",value:i.batchStrategy,onChange:l=>c("batchStrategy",l.target.value),disabled:!s,className:a})}),e.jsxs(p,{title:"Advanced Learning Settings",count:5,children:[e.jsx(o,{label:"Field Reward Half-Life (days)",tip:`${t}
Lives in: learning reward decay.
What this controls: how quickly historical field rewards lose influence over time.`,children:e.jsx(d,{draftKey:"fieldRewardHalfLifeDays",value:i.fieldRewardHalfLifeDays,bounds:r("fieldRewardHalfLifeDays"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(o,{label:"Max Hypothesis Items",tip:`${t}
Lives in: hypothesis queue sizing.
What this controls: the maximum number of hypothesis rows self-improve will consider in one pass.`,children:e.jsx(d,{draftKey:"maxHypothesisItems",value:i.maxHypothesisItems,bounds:r("maxHypothesisItems"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(o,{label:"Endpoint Signal Limit",tip:`${t}
Lives in: endpoint mining and signal retention.
What this controls: how many endpoint signals a page scan may keep.`,children:e.jsx(d,{draftKey:"endpointSignalLimit",value:i.endpointSignalLimit,bounds:r("endpointSignalLimit"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(o,{label:"Endpoint Suggestion Limit",tip:`${t}
Lives in: endpoint suggestion promotion.
What this controls: how many endpoint suggestions may be promoted from the retained signals.`,children:e.jsx(d,{draftKey:"endpointSuggestionLimit",value:i.endpointSuggestionLimit,bounds:r("endpointSuggestionLimit"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(o,{label:"Endpoint Network Scan Limit",tip:`${t}
Lives in: endpoint signal scanning.
What this controls: the cap on network responses inspected while mining endpoint signals.`,children:e.jsx(d,{draftKey:"endpointNetworkScanLimit",value:i.endpointNetworkScanLimit,bounds:r("endpointNetworkScanLimit"),step:1,disabled:!s,className:a,onNumberChange:n})})]})]}),e.jsx("div",{id:m("automation-helper"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Helper Runtime",children:[e.jsx(g,{label:"Category Authority Enabled",tip:`${t}
Lives in: helper and authority-file substrate used beside the main runtime.
What this controls: whether category authority data and helper files are available to the automation layer.`,hint:"Controls all helper file runtime settings below.",children:e.jsx(h,{checked:i.categoryAuthorityEnabled,onChange:l=>c("categoryAuthorityEnabled",l),disabled:!s})}),e.jsx(o,{label:"Category Authority Root",tip:`${t}
Lives in: category authority file resolution.
What this controls: the root directory for category authority data files.`,children:e.jsx("input",{type:"text",value:i.categoryAuthorityRoot,onChange:l=>c("categoryAuthorityRoot",l.target.value),disabled:!s,className:a})}),e.jsx(p,{title:"Advanced Helper Settings",count:1,children:e.jsx(o,{label:"Helper Supportive Fill Missing",tip:`${t}
Lives in: helper supportive-fill policy.
What this controls: whether helper logic may fill missing values when running in supportive mode.`,children:e.jsx(h,{checked:i.helperSupportiveFillMissing,onChange:l=>c("helperSupportiveFillMissing",l),disabled:!s})})})]}),e.jsx("div",{id:m("automation-operations"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Operations",children:[e.jsx(o,{label:"Daemon Concurrency",tip:`${t}
Lives in: daemon orchestration.
What this controls: how many product runs daemon mode may execute concurrently.`,children:e.jsx(d,{draftKey:"daemonConcurrency",value:i.daemonConcurrency,bounds:r("daemonConcurrency"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsxs(p,{title:"Resume",count:2,children:[e.jsx(o,{label:"Indexing Resume Seed Limit",tip:`${t}
Lives in: daemon and resume bootstrap.
What this controls: the maximum number of seed URLs loaded when resuming prior work.`,children:e.jsx(d,{draftKey:"indexingResumeSeedLimit",value:i.indexingResumeSeedLimit,bounds:r("indexingResumeSeedLimit"),step:1,disabled:!s,className:a,onNumberChange:n})}),e.jsx(o,{label:"Indexing Resume Persist Limit",tip:`${t}
Lives in: daemon and resume bootstrap.
What this controls: the maximum number of persisted items loaded while reconstructing resume state.`,children:e.jsx(d,{draftKey:"indexingResumePersistLimit",value:i.indexingResumePersistLimit,bounds:r("indexingResumePersistLimit"),step:1,disabled:!s,className:a,onNumberChange:n})})]}),e.jsxs(p,{title:"Import Watcher",count:2,children:[e.jsx(o,{label:"Imports Root",tip:`${t}
Lives in: daemon import watcher.
What this controls: the directory monitored for inbound imports.`,children:e.jsx("input",{type:"text",value:i.importsRoot,onChange:l=>c("importsRoot",l.target.value),disabled:!s,className:a})}),e.jsx(o,{label:"Imports Poll Seconds",tip:`${t}
Lives in: daemon import watcher scheduling.
What this controls: how often the import watcher polls for new work.`,children:e.jsx(d,{draftKey:"importsPollSeconds",value:i.importsPollSeconds,bounds:r("importsPollSeconds"),step:1,disabled:!s,className:a,onNumberChange:n})})]})]})]})});export{w as RuntimeFlowAutomationSection};
