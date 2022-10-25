export function getUrlParam(key: string) {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);

  return urlParams.get(key); // || getUrlParamFromParentFrame(key);
}

export function setUrlParameter(key, value) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  // url.searchParams.delete('param2');
  window.history.replaceState(null, null, url);
}
