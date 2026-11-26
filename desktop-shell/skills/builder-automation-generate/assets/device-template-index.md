# Device templates 索引（包内子集）

路径：`assets/device_templates/{model}.json`，`model` = 图谱 `properties.resourceId`。

## 加载规则

1. 先确认 graph 中设备的 `resourceId`（型号）
2. **直接** `read_file assets/device_templates/{resourceId}.json`（每个 model 最多 1 次）
3. **禁止** `ls` / `glob` 列出 `device_templates/`（会拖慢整轮）
4. 文件不存在或不可写 → 记入 `capability_gaps`，跳过；勿探索目录

## 本包说明

包内为金样与常见联动相关模板子集。路径即文件名 = 型号。无需先列目录。
