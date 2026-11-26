# 预算档位策略

设备库 SKU 的 `commerce.msrp` / `priceBand` 当前均为 null。

## 规则

1. **禁止**输出具体金额或伪造「总价 ¥x」
2. 使用三档：`basic`（基础）/ `comfort`（舒适，默认）/ `flagship`（旗舰）
3. 对话与 artifact 的预算字段写：`预算说明：舒适档 · 具体报价以门店为准`
4. 用户未提预算 → 默认 `comfort`，并声明一次
5. 用户说「尽量便宜」→ `basic`；「顶配/全屋高端」→ `flagship`（在同类中选能力更全的 model，仍无价格）
