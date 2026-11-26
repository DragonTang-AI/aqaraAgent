# Aqara Life Plugin Store H5 contract

Use this reference for H5 folders intended to pass through `PluginDetailViewController`.

## Source-backed chain

1. `PluginDetailViewController` forwards install, update, and apply actions to `PluginDetailViewModel`.
2. Installation obtains a current download URL using `pluginId + versionId`, downloads a zip with resume support and Life global headers, computes SHA-256, and compares it when `packageSha256` is populated.
3. `SSZipArchive` extracts the zip. For `pluginType == "h5"`, extraction accepts either root files or one enclosing directory, then atomically replaces `Caches/plugins/<pluginId>` with rollback on failure.
4. Apply/open resolves compatible Studio devices. Marketplace metadata `deviceTypes` must intersect a current device's `deviceTypesList`; otherwise the UI does not create a launch request. This is publishing metadata, not a file inside the generated H5 folder.
5. `LMDevicePluginLauncher` accepts runtime types `h5` and `rn`. H5 opens through `WebViewController(localPluginPath:, pageType: .h5Plugin)`, binds the launch request, and appends the selected device as the `did` query parameter.
6. `LMAccessNetWebViewController` resolves `index.html`, `index.htm`, a sole root HTML file, or a nested entry one level down. It loads local content with read access to the installed plugin root and installs `nativeBridge`.

## Generated-folder requirements

- Put `index.html` directly at the generated folder root; this is the deterministic path and avoids relying on fallback entry discovery.
- Reference every CSS, JS, image, and font using a relative local path under the same root.
- Do not require `plugin.json`, `project.json`, or a JS bundle for H5. Current installation code requires those only for RN bundles.
- Do not generate a zip. The marketplace/upload pipeline owns archive creation, URL/version metadata, and SHA-256 publication.
- Parse `did`, `themeMode`, and `language` from the entry query. Treat them as runtime context, never as generated identities.
- Publish the marketplace record with `pluginType: "h5"` and compatible `deviceTypes`; otherwise `PluginDetailViewController` can install the folder but its Apply flow will show no supported device.
- Keep compatibility with the app's iOS 15.1 deployment baseline. Native `<dialog>`/`showModal()` and CSS `color-mix()` are not allowed in the base template.

## Mode choice

- Whole-Studio dashboard: generate with `--scope studio`. A selected `did` is placed first but does not hide other devices or scenes.
- Single-device control plugin: generate with `--scope selected-device`. Missing or stale `did` fails closed; control coordinates still come from public `GET /devices/definitions` for that runtime device ID.
