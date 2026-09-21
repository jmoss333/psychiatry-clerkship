const ESSENTIALS_RESOURCE_SELECTOR = [
  '.fd-kit__reading[data-fd-open]',
  '.fd-kit__tool-tabs [data-fd-kit-tool]',
].join(', ');

export function essentialsResources(page) {
  return page.locator(ESSENTIALS_RESOURCE_SELECTOR);
}

export function essentialsResourceRefs(page) {
  return essentialsResources(page).evaluateAll(nodes => (
    nodes.map(node => node.dataset.fdOpen || node.dataset.fdKitTool)
  ));
}
