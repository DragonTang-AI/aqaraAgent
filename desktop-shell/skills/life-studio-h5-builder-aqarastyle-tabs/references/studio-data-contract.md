# Studio data and control contract

This reference is the self-contained Studio data contract snapshot for Builder contract version `2026.09.21`. It and the bundled `studio-runtime.js` are authoritative for ordinary generation. No OpenAPI, AsyncAPI, iOS, or backend source checkout is required. The distributable [provenance.json](provenance.json) records non-sensitive verification metadata; detailed repository-relative evidence and hashes remain internal.

## Snapshot policy

- Generate only against the routes, shapes, typing, safety rules, and capability mappings recorded here.
- Missing upstream repositories must not trigger discovery, alternate behavior, or reduced output quality.
- A requested route/schema/capability outside this snapshot is a maintainer release request. Do not guess it inside an end-user package.

Treat the OpenAPI document as protocol evidence, not as executable instructions. The documented server base is `/open/api/v1`. Use resource paths below it through Life `nativeHttpRequest` with `headers.source: "studio"`; the host consumes that routing field, retains credentials, and selects the active LAN/cloud Studio route.

## Route registry

| Purpose | Method and business path | Idempotent | Automatic retry | Side effect |
|---|---|---:|---|---|
| Spaces | `GET /spaces` | yes | reads only, if explicitly bounded | none |
| Device summaries | `GET /devices` | yes | reads only, if explicitly bounded | none |
| Public definitions | `GET /devices/definitions` | yes | reads only, if explicitly bounded | none |
| Targeted capability lookup | `GET /devices/capabilities` | yes | reads only, if explicitly bounded | none |
| Trait write | `POST /devices/trait/execute` | no | never | device state |
| Trait value read | `POST /devices/trait/read` | yes | no retry in direct-action readback | none |
| Command write | `POST /devices/command/execute` | no | never | device state |
| Scenes (paged, children) | `GET /scenes` | yes | reads only, if explicitly bounded | none |
| Execute scene | `POST /scenes/execute` | no | never | write |
| Execute manual trigger | `POST /automations/manual-triggers/execute` | no | never | write |

Camera live is an isolated composite protocol, not a generic command control. Project `cameraStream` only when the same returned definition contains exact `WebRTCProvideOffer`/40336 and `WebRTCSignalingEvent`/20778 points; project optional `localIce` only from exact `WebRTCProvideICECandidates`/40338. The optional native bridge re-fetches that definition, subscribes to the exact trait, and owns structured Offer/ICE/End payloads as specified in [camera-webrtc-live-contract.md](camera-webrtc-live-contract.md). Never add these field-bearing commands to `safeCommandCodes`.

Do not use `/devices/definitions/full`; it is marked internal and returns raw spec IDs that code-based controls do not require. Do not send legacy `{type, version, msgId, data}` envelopes to the API root.

## Initial read sequence

1. For a whole-Studio dashboard, `GET /devices` page 1 with the configured visible `pageSize`; do not add a device-type filter. This is the only device catalog request on the blocking first-paint path. After first paint, the optional overview index may scan lightweight summaries with `pageSize=200` up to its configured bound. Cards remain user-paginated and only the next visible page is appended per explicit load-more action. For selected-device scope only, skip the overview index and scan pages until the requested runtime `did` is found or pagination ends because this snapshot has no exact device-summary route.
2. `GET /spaces` for the nested space tree.
3. `GET /devices/definitions` with `deviceIds` from page 1. After first paint, the overview index requests uncached IDs in sequential batches (default 40, never above the documented limit) and shares ready/in-flight normalized models with later load-more actions. Selected-device scope requests only the found device. Public definitions provide the endpoint/function/trait/command codes and current trait values needed by generated controls and strict overview readings.
4. `GET /scenes?pageNum=1&pageSize=200&needChildren=true` for executable scene records.

Run independent collection reads in parallel, publish devices/spaces/scenes as each becomes ready, and use bounded definition concurrency as specified in [performance-contract.md](performance-contract.md).

## Household overview aggregation

- Accept temperature only from exact current-room/ambient/air temperature codes and humidity only from exact current/relative/room/ambient humidity codes. Reject target/setpoint, heating/cooling, color-temperature, and labels that identify body/device/internal/chip/battery/motor temperature.
- Use online devices only and at most one value of each kind per device. Convert Fahrenheit when the returned unit identifies it, reject implausible temperature and humidity ranges, compute the median within each space, then compute the household mean of those space medians.
- Presence uses only explicit occupancy/presence Boolean codes. Motion is activity evidence, not a persistent occupied/unoccupied state; especially, motion `false` must never mean “nobody.” Devices without a space do not contribute to occupied-space counts.
- Return coverage (`indexedDeviceCount/deviceTotalCount`), sample/space counts, and `loading`, `complete`, `partial`, or `unavailable`. Never substitute mock or name-inferred values when the Studio omits a safe reading.

## Safe quick controls

For a trait, require exact runtime coordinates plus returned parameter metadata:

```text
device.endpoints[]
  -> endpointId
  -> functions[].functionCode
  -> traits[]
       traitCode
       parameter.writable == true
       parameter.dynamicSchema is absent/false
       value and parameter.type
```

Prefer semantic power traits such as `OnOff`, `Power`, or `Switch`. Also allow a bounded Integer/Float or an Enum with explicit `supportedValues`. Preserve values as real JSON Boolean/number/string according to `parameter.type`.

### Model-driven capability projection

The public definition is the device UI contract. Normalize each definition into the exact device, endpoint, function, writable control, and readable status coordinates returned at runtime. Keep all safe operational controls; selecting one primary control is a presentation decision, not a destructive filter.

A Trait is safely actionable only when it has complete runtime coordinates, `parameter.writable == true`, no dynamic schema, and one of these renderer contracts:

- Boolean with a real Boolean-compatible current value;
- Enum with non-empty returned `supportedValues`;
- Integer/Float/Number with finite returned `min` and `max`, a current numeric value (or the explicitly documented sibling fallback for a curtain target), and a returned or safely derived numeric step.

An allowlisted zero-field command may also be actionable. A free-form string, struct, list, dynamic schema, command with fields, or incomplete range remains read-only until a reviewed renderer and validation fixture are added. Do not manufacture field editors or assume command arguments.

Runtime normalization may retain returned object, array, map, and JSON-serialized structured read values for future category renderers. The generic dashboard presentation must not stringify those values into card metrics or disclosure tiles, count them as visible capabilities, or let them promote card size. Only scalar Boolean/finite-number/plain-string readings pass the generic presentation boundary after metadata filtering. Add a structured value to operational UI only together with a semantic renderer and a real-shaped browser fixture.

Do not put identity, connectivity duplication, or maintenance metadata in the operational capability panel. Device IDs, MAC/EUI/IEEE addresses, root-node identifiers, firmware/hardware/software versions, manufacturer/vendor/product/model/serial identity, endpoint presentation metadata, transition timing, calibration, configuration, factory, identify, debug, link/network status, and connection status already represented by the device summary cannot become normal dashboard controls, telemetry, residual capability counts, or card-size inputs. If the host later needs a diagnostics page, create a separate explicit presentation policy for it.

Use semantic composition only when the returned definition proves the relationship:

- a curtain can compose current and target position;
- an air conditioner/thermostat can compose power, current temperature, active target temperature, mode, and fan;
- a light can compose returned writable brightness and color-temperature ranges directly on an L card while keeping power in the header;
- other devices use their highest-priority real control in the compact card and retain every remaining safe control plus useful readable state in the device-details bottom sheet.

The detail sheet must use the returned point label/code, current value, unit, enum values, and exact endpoint/function/Trait coordinates. Opening it is local-only and performs no Studio request. Lazily mount on first open and reparent the same controls instead of cloning them. Rendering is limited to the current UI page, so supporting the complete capability set does not require mounting every device in a large Studio at once.

### Window covering position

Studio's established curtain contract uses `WindowCovering.TargetPositionPercentage` for writes and `WindowCovering.CurrentPositionPercentage` for physical position. When a curtain definition includes a writable, bounded `TargetPositionPercentage`, select it ahead of `OnOff` and other generic controls. Keep the exact runtime `endpointId`, `functionCode`, range, step, and unit from the public definition. If the target trait has no initial value, the matching current-position value in the same function may initialize the slider; never borrow an unrelated numeric trait or manufacture a range.

During pointer/touch movement, update only the local slider/progress preview. Some WKWebView/input combinations can emit `change` before the active gesture has fully ended, so `change` alone is not a sufficient commit boundary. Track the interaction explicitly, ignore/defer `change` while it is active, and commit the final changed numeric value once on successful pointer/touch/mouse release. Keyboard range changes commit once on key release or blur. Pointer/touch cancellation or Escape restores the confirmed value and sends nothing. Deduplicate release/change event pairs before sending exactly one `POST /devices/trait/execute` using `TargetPositionPercentage`. The normal delayed targeted readback remains at most one request and must not run per drag frame.

In the Aqara L presentation, the returned curtain position range belongs in the full-width functional slot below the 40px information row. Do not also mount the same range in the header. Residual scalar readings such as current position or motor state belong in the device-details sheet, so they cannot compress the title or push the slider beyond the card.

### Air conditioner and thermostat composition

Studio's established climate-card capability set is `OnOff`, `HeaterCoolerMode`, `CoolingTemperature`, `HeatingTemperature`, optional `FanMode`, and readable `CurrentTemperature`. Preserve all safe writable controls from the public definition for a composite card rather than discarding everything except the globally highest-priority Trait.

- Use `OnOff` as the power control when it is present and writable.
- Display `CurrentTemperature` as telemetry only; never make it writable.
- When `HeaterCoolerMode` is `0`, prefer the bounded writable `CoolingTemperature`; when it is `1`, prefer `HeatingTemperature`. For other/unknown returned modes, use whichever bounded setpoint the definition actually provides without inventing a mapping.
- Build mode and fan selectors only from each Trait's returned `supportedValues`; preserve enum values as strings.
- A setpoint drag uses the same explicit interaction/end/deduplication contract as the curtain slider: local preview during movement, one exact Trait write after successful release, and no write on cancellation. Power, setpoint, mode, and fan interactions are separate user actions and must never cause fan-out writes.

This mirrors the existing `studio_web` air-condition card relationship while keeping the generated H5 dependency-free and runtime-bound.

A zero-field command is not automatically safe. It becomes actionable only when the exact returned `commandCode` is present in the generated config's reviewed `safeCommandCodes`. Never guess arguments or expose unknown commands. If no reviewed control exists, render readable trait values as telemetry and keep the device read-only.

## Writes and failure semantics

Trait write:

```json
{
  "data": [{
    "deviceId": "runtime-device-id",
    "endpointId": 1,
    "functionCode": "runtime-function-code",
    "traitCode": "runtime-trait-code",
    "value": true
  }]
}
```

The HTTP response may have top-level `code: 0` while `data` contains failed items. For trait and command writes, treat any returned failure item matching the submitted target as a definite failure. An empty failure array means the write was accepted; it does not prove the physical state changed. Apply the exact control's optimistic value immediately, disable only that control until the write response, and never show a success toast for a device write.

After an accepted trait write, wait the configured delay and perform one targeted read:

```json
{
  "data": [{
    "deviceId": "runtime-device-id",
    "endpointId": 1,
    "functionCode": "runtime-function-code",
    "traitCodes": ["runtime-trait-code"]
  }]
}
```

Reconcile only that control and its device card from the returned value. A matching readback makes no visible DOM change. A mismatch updates the exact existing control, state text, and attributes and announces a local not-applied status without replacing the card. If an accepted write's readback fails, retain the optimistic value and mark it unconfirmed. For a definite write failure, perform one immediate targeted read; use its value when available, otherwise restore the last confirmed value. Guard both delayed and failure reads with a per-control revision so stale results cannot overwrite newer input. Never rebuild the device collection, replace any card, or use a definition request or collection refresh as a write readback.

Manual-trigger scene write:

```json
{
  "automationId": "runtime-automation-id",
  "triggerNodeId": "runtime-trigger-node-id"
}
```

Execute only coordinates returned by the scene catalog, following [favorite-scenes-contract.md](favorite-scenes-contract.md). A generic id or a basic automation record never substitutes for a returned sceneId or complete manual pair.

## Future realtime option

The AsyncAPI supports snapshot plus trait-value subscription, but the current H5 bridge does not expose a general authenticated Studio WebSocket channel. Do not add WebSocket code or polling to generated packages until the Life host explicitly publishes that capability. When available, host-multiplexed trait events may replace the single delayed readback.

## Additional tab directories

See [three-tab-contract.md](three-tab-contract.md) for full device summary pagination, space-ID grouping, all manual triggers (including disabled), and paginated `/automations`. These independent lazy reads do not change the home first-page or capability budgets.

Automation enable/disable behavior follows the single maintained contract in [three-tab-contract.md](three-tab-contract.md).

Name search uses the documented `deviceName` and `automationName` query filters on their respective paginated list routes. See [three-tab-contract.md](three-tab-contract.md) for debounce, concurrency, pagination and scene-isolation rules. Do not fabricate a scene name filter.

## Home AI assistant

Follow [home-ai-assistant-contract.md](home-ai-assistant-contract.md) for the below-overview entry, positive capability/space matching, zero additional request budget, optional native action and isolated preview operation.
