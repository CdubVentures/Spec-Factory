export function createFieldKeyOrderStore({ stmts }) {
  function getFieldKeyOrder(category) {
    return stmts._getFieldKeyOrder.get(category) || null;
  }
  function setFieldKeyOrder(category, orderJson) {
    return stmts._setFieldKeyOrder.run({ category, order_json: orderJson });
  }
  function deleteFieldKeyOrder(category) {
    return stmts._deleteFieldKeyOrder.run(category);
  }
  return { getFieldKeyOrder, setFieldKeyOrder, deleteFieldKeyOrder };
}
