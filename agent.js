export const agent = {
  id: "cursor-bridge",
  name: "Cursor · Magpie Bridge",
  icon: "cursor",
  bin: "cursor",
  dir: "~/.cursor",
  config: "~/.config/magpie-cursor-bridge/connection.json",
  format: "json",
  model: "model",
  ua: ["cursor-magpie-bridge"],
  notice: "在 Magpie 中选择模型，首次连接后重启 Cursor 即可开始使用。后台桥接随连接自动启停；断开后自动还原代理。"
};
export function connect({ gateway, model, models }) {
  return {
    enabled: true,
    gateway: gateway.v1,
    key: gateway.key,
    models: models.map(m => ({id: m.id, name: m.name || m.id, context: m.context || null}))
  };
}
