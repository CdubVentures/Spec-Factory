import{r as d,j as e}from"./vendor-ui-ComJg1Ad.js";import{an as p,ao as i,ap as r,as as x}from"./index-BsFb2qC1.js";import"./vendor-react-yyJz49DP.js";import"./vendor-query-B32LnyU-.js";const s="Phase coverage: Stage 13 Validation To Output plus durable artifact persistence across the full run.",L=d.memo(function({runtimeDraft:o,runtimeSettingsReady:n,inputCls:l,runtimeSubStepDomId:u,updateDraft:a,onNumberChange:g,getNumberBounds:v,storageAwsRegion:h,storageS3Bucket:c}){return e.jsxs(e.Fragment,{children:[e.jsx("div",{id:u("run-output-destinations"),className:"scroll-mt-24"}),e.jsxs(p,{title:"Output Destinations",children:[e.jsx(i,{label:"Output Mode",tip:`${s}
Lives in: final export routing.
What this controls: whether run artifacts are written locally, mirrored to both destinations, or sent only to S3 paths.`,children:e.jsxs("select",{value:o.outputMode,onChange:t=>a("outputMode",t.target.value),disabled:!n,className:l,children:[e.jsx("option",{value:"local",children:"local"}),e.jsx("option",{value:"dual",children:"dual"}),e.jsx("option",{value:"s3",children:"s3"})]})}),e.jsx(i,{label:"Local Mode",tip:`${s}
Lives in: runtime export behavior switches.
What this controls: whether the run uses the local-mode output behavior path instead of cloud-oriented assumptions.`,children:e.jsx(r,{checked:o.localMode,onChange:t=>a("localMode",t),disabled:!n})}),e.jsx(i,{label:"Dry Run",tip:`${s}
Lives in: final artifact persistence gates.
What this controls: whether the runtime executes the pipeline but skips persisting publish-grade final outputs.`,children:e.jsx(r,{checked:o.dryRun,onChange:t=>a("dryRun",t),disabled:!n})}),e.jsx(i,{label:"Local Input Root",tip:`${s}
Lives in: local fixture and input resolution.
What this controls: the root path used when the runtime reads local input fixtures or mirrored assets.`,children:e.jsx("input",{type:"text",value:o.localInputRoot,onChange:t=>a("localInputRoot",t.target.value),disabled:!n,className:l})}),e.jsx(i,{label:"Local Output Root",tip:`${s}
Lives in: local export destination resolution.
What this controls: the root directory where local run outputs, analysis artifacts, and latest snapshots are written.`,children:e.jsx("input",{type:"text",value:o.localOutputRoot,onChange:t=>a("localOutputRoot",t.target.value),disabled:!n,className:l})}),e.jsx(i,{label:"Runtime Events Key",tip:`${s}
Lives in: runtime event-stream export.
What this controls: the output key or path used for the runtime events artifact.`,children:e.jsx("input",{type:"text",value:o.runtimeEventsKey,onChange:t=>a("runtimeEventsKey",t.target.value),disabled:!n,className:l})}),e.jsx(i,{label:"Write Markdown Summary",tip:`${s}
Lives in: summary artifact generation after completion.
What this controls: whether a Markdown summary is emitted when the run finishes.`,children:e.jsx(r,{checked:o.writeMarkdownSummary,onChange:t=>a("writeMarkdownSummary",t),disabled:!n})}),e.jsx(i,{label:"Runtime Control File",tip:`${s}
Lives in: runtime override loading before and during execution.
What this controls: the control file path used for runtime override inputs.`,children:e.jsx("input",{type:"text",value:o.runtimeControlFile,onChange:t=>a("runtimeControlFile",t.target.value),disabled:!n,className:l,placeholder:"_runtime/control/runtime_overrides.json"})}),e.jsxs(x,{title:"S3 and Cloud Integrations",count:8,children:[e.jsx(i,{label:"Mirror To S3",tip:`${s}
Lives in: post-run artifact mirroring.
What this controls: whether output artifacts are copied to the configured S3 destination paths.`,children:e.jsx(r,{checked:o.mirrorToS3,onChange:t=>a("mirrorToS3",t),disabled:!n})}),e.jsx(i,{label:"Mirror To S3 Input",tip:`${s}
Lives in: input fixture mirroring.
What this controls: whether locally sourced input fixtures are mirrored to the configured S3 input prefix.`,children:e.jsx(r,{checked:o.mirrorToS3Input,onChange:t=>a("mirrorToS3Input",t),disabled:!n})}),e.jsx(i,{label:"S3 Input Prefix",tip:`${s}
Lives in: S3 input destination resolution.
What this controls: the prefix used when mirrored input assets are written to S3.`,children:e.jsx("input",{type:"text",value:o.s3InputPrefix,onChange:t=>a("s3InputPrefix",t.target.value),disabled:!n,className:l})}),e.jsx(i,{label:"S3 Output Prefix",tip:`${s}
Lives in: S3 output destination resolution.
What this controls: the prefix used when output artifacts are mirrored to S3.`,children:e.jsx("input",{type:"text",value:o.s3OutputPrefix,onChange:t=>a("s3OutputPrefix",t.target.value),disabled:!n,className:l})}),e.jsx(i,{label:"ELO Supabase Anon Key",tip:`${s}
Lives in: optional cloud integration wiring.
What this controls: the anonymous key used by optional ELO Supabase integrations.`,children:e.jsx("input",{type:"text",value:o.eloSupabaseAnonKey,onChange:t=>a("eloSupabaseAnonKey",t.target.value),disabled:!n,className:l})}),e.jsx(i,{label:"ELO Supabase Endpoint",tip:`${s}
Lives in: optional cloud integration wiring.
What this controls: the base endpoint used by optional ELO Supabase integrations.`,children:e.jsx("input",{type:"text",value:o.eloSupabaseEndpoint,onChange:t=>a("eloSupabaseEndpoint",t.target.value),disabled:!n,className:l})}),e.jsx(i,{label:"AWS Region",tip:`${s}
Lives in: shared storage configuration.
What this controls: the AWS region token used for S3 and related integrations.`,description:"Configured on Storage tab.",children:e.jsx("span",{className:"sf-text-label",children:h||o.awsRegion||"us-east-2"})}),e.jsx(i,{label:"S3 Bucket",tip:`${s}
Lives in: shared storage configuration.
What this controls: the bucket name used for input and output mirroring.`,description:"Configured on Storage tab.",children:e.jsx("span",{className:"sf-text-label",children:c||o.s3Bucket||"(not set)"})})]})]})]})});export{L as RuntimeFlowRunOutputSection};
