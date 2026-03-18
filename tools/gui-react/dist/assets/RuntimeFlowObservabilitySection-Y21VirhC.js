import{r as u,j as e}from"./vendor-ui-ComJg1Ad.js";import{Y as j,$ as x,a1 as p,a0 as r,a2 as n,a3 as b,a4 as v}from"./index-CMVaMk29.js";import"./vendor-react-yyJz49DP.js";import"./vendor-query-B32LnyU-.js";const t="Phase coverage: cross-cutting across stages 01-13.",J=u.memo(function({runtimeDraft:s,runtimeSettingsReady:a,traceControlsLocked:l,inputCls:o,runtimeSubStepDomId:m,updateDraft:c,onNumberChange:d,getNumberBounds:h,renderDisabledHint:g}){return e.jsx("div",{className:"space-y-3",children:e.jsxs(j,{title:"Observability",subtitle:"Runtime trace, event diagnostics, and screencast controls.",children:[e.jsx("div",{id:m("observability-trace-core"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Trace Configuration",children:[e.jsx(p,{label:"Runtime Trace Enabled",tip:`${t}
Lives in: runtime event and trace emission used by Runtime Ops.
What this controls: whether the runtime records trace packets and emits the trace stream at all.`,hint:"Controls trace ring, LLM payload, and screencast settings below",children:e.jsx(r,{checked:s.runtimeTraceEnabled,onChange:i=>c("runtimeTraceEnabled",i),disabled:!a})}),e.jsx(n,{label:"Fetch Trace Ring Size",tip:`${t}
Lives in: in-memory trace buffering for fetch work.
What this controls: how many fetch events are retained in memory before older ones roll off.`,disabled:l,children:e.jsx(b,{draftKey:"runtimeTraceFetchRing",value:s.runtimeTraceFetchRing,bounds:h("runtimeTraceFetchRing"),step:1,disabled:!a||l,className:o,onNumberChange:d})}),e.jsx(n,{label:"LLM Trace Ring Size",tip:`${t}
Lives in: in-memory trace buffering for LLM work.
What this controls: how many LLM events are retained in memory before older ones roll off.`,disabled:l,children:e.jsx(b,{draftKey:"runtimeTraceLlmRing",value:s.runtimeTraceLlmRing,bounds:h("runtimeTraceLlmRing"),step:1,disabled:!a||l,className:o,onNumberChange:d})}),e.jsx(n,{label:"Trace LLM Payloads",tip:`${t}
Lives in: LLM trace payload capture.
What this controls: whether prompt and response previews are attached to runtime trace events for LLM calls.`,disabled:l,children:e.jsx(r,{checked:s.runtimeTraceLlmPayloads,onChange:i=>c("runtimeTraceLlmPayloads",i),disabled:!a||l})}),e.jsx(n,{label:"Events NDJSON Write",tip:`${t}
Lives in: event-stream persistence.
What this controls: whether runtime events are written to an NDJSON artifact on disk.`,children:e.jsx(r,{checked:s.eventsJsonWrite,onChange:i=>c("eventsJsonWrite",i),disabled:!a})})]}),l?g("Trace ring and payload controls are disabled because Runtime Trace is OFF."):null,e.jsx("div",{id:m("observability-trace-outputs"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Data Streams",children:[e.jsx(n,{label:"Authority Snapshot Enabled",tip:`${t}
Lives in: settings and authority propagation diagnostics.
What this controls: whether authority snapshot payloads are emitted for cross-surface debugging.`,children:e.jsx(r,{checked:s.authoritySnapshotEnabled,onChange:i=>c("authoritySnapshotEnabled",i),disabled:!a})}),e.jsxs(v,{title:"Dual-Write Toggles",count:6,children:[e.jsx(n,{label:"Queue JSON Write",tip:`${t}
Lives in: queue persistence diagnostics.
What this controls: whether queue data is dual-written to JSON for migration safety.`,children:e.jsx(r,{checked:s.queueJsonWrite,onChange:i=>c("queueJsonWrite",i),disabled:!a})}),e.jsx(n,{label:"Billing JSON Write",tip:`${t}
Lives in: billing persistence diagnostics.
What this controls: whether billing data is dual-written to JSON for migration safety.`,children:e.jsx(r,{checked:s.billingJsonWrite,onChange:i=>c("billingJsonWrite",i),disabled:!a})}),e.jsx(n,{label:"Intel JSON Write",tip:`${t}
Lives in: discovery-intel persistence diagnostics.
What this controls: whether discovery intel data is dual-written to JSON for migration safety.`,children:e.jsx(r,{checked:s.intelJsonWrite,onChange:i=>c("intelJsonWrite",i),disabled:!a})}),e.jsx(n,{label:"Corpus JSON Write",tip:`${t}
Lives in: corpus and evidence persistence diagnostics.
What this controls: whether corpus and evidence data are dual-written to JSON for migration safety.`,children:e.jsx(r,{checked:s.corpusJsonWrite,onChange:i=>c("corpusJsonWrite",i),disabled:!a})}),e.jsx(n,{label:"Learning JSON Write",tip:`${t}
Lives in: learning-store persistence diagnostics.
What this controls: whether learning-store data is dual-written to JSON for migration safety.`,children:e.jsx(r,{checked:s.learningJsonWrite,onChange:i=>c("learningJsonWrite",i),disabled:!a})}),e.jsx(n,{label:"Cache JSON Write",tip:`${t}
Lives in: cache persistence diagnostics.
What this controls: whether cache data is dual-written to JSON for migration safety.`,children:e.jsx(r,{checked:s.cacheJsonWrite,onChange:i=>c("cacheJsonWrite",i),disabled:!a})})]})]}),e.jsx("div",{id:m("observability-trace-video"),className:"scroll-mt-24"}),e.jsxs(x,{title:"Video Capture",children:[e.jsx(p,{label:"Runtime Screencast Enabled",tip:`${t}
Lives in: Runtime Ops live browser instrumentation.
What this controls: whether browser-backed fetch work can publish screencast frames for operators.`,hint:"Controls screencast quality settings below",children:e.jsx(r,{checked:s.runtimeScreencastEnabled,onChange:i=>c("runtimeScreencastEnabled",i),disabled:!a})}),e.jsxs(v,{title:"Screencast Quality",count:4,children:[e.jsx(n,{label:"Runtime Screencast FPS",tip:`${t}
Lives in: screencast encoder timing.
What this controls: the target frame rate for emitted screencast frames.`,disabled:!s.runtimeScreencastEnabled,children:e.jsx(b,{draftKey:"runtimeScreencastFps",value:s.runtimeScreencastFps,bounds:h("runtimeScreencastFps"),step:1,disabled:!a||!s.runtimeScreencastEnabled,className:o,onNumberChange:d})}),e.jsx(n,{label:"Runtime Screencast Quality",tip:`${t}
Lives in: screencast encoding.
What this controls: the JPEG quality used for screencast frames.`,disabled:!s.runtimeScreencastEnabled,children:e.jsx(b,{draftKey:"runtimeScreencastQuality",value:s.runtimeScreencastQuality,bounds:h("runtimeScreencastQuality"),step:1,disabled:!a||!s.runtimeScreencastEnabled,className:o,onNumberChange:d})}),e.jsx(n,{label:"Runtime Screencast Max Width",tip:`${t}
Lives in: screencast frame sizing.
What this controls: the maximum width allowed for screencast frames.`,disabled:!s.runtimeScreencastEnabled,children:e.jsx(b,{draftKey:"runtimeScreencastMaxWidth",value:s.runtimeScreencastMaxWidth,bounds:h("runtimeScreencastMaxWidth"),step:10,disabled:!a||!s.runtimeScreencastEnabled,className:o,onNumberChange:d})}),e.jsx(n,{label:"Runtime Screencast Max Height",tip:`${t}
Lives in: screencast frame sizing.
What this controls: the maximum height allowed for screencast frames.`,disabled:!s.runtimeScreencastEnabled,children:e.jsx(b,{draftKey:"runtimeScreencastMaxHeight",value:s.runtimeScreencastMaxHeight,bounds:h("runtimeScreencastMaxHeight"),step:10,disabled:!a||!s.runtimeScreencastEnabled,className:o,onNumberChange:d})})]})]})]})})});export{J as RuntimeFlowObservabilitySection};
