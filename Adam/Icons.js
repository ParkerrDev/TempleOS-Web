const paths={
  play:'<path d="M4 2l10 6-10 6z" fill="currentColor" stroke="none"/>',
  stop:'<path d="M3 3h10v10H3z" fill="currentColor" stroke="none"/>',
  copy:'<path d="M5 5h9v9H5zM2 11V2h9"/>',
  clip:'<circle cx="4" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><path d="M6 5l8 8M6 11l8-8"/>',
  previous:'<path d="M4 3v10M13 3l-7 5 7 5z"/>',
  next:'<path d="M12 3v10M3 3l7 5-7 5z"/>',
  random:'<path d="M2 4h2l8 8h2M2 12h2l8-8h2M11 1l3 3-3 3M11 9l3 3-3 3"/>',
  folder:'<path d="M1 3h5l2 2h7v9H1z"/>',
  file:'<path d="M3 1h6l4 4v10H3zM9 1v4h4M5 8h6M5 11h6"/>',
  back:'<path d="M10 2L4 8l6 6M4 8h11"/>',
  forward:'<path d="M6 2l6 6-6 6M1 8h11"/>',
  up:'<path d="M2 8l6-6 6 6M8 2v13"/>',
  refresh:'<path d="M13 6a5 5 0 1 0 0 5M9 6h5V1"/>',
  download:'<path d="M8 1v9M4 6l4 4 4-4M2 11v4h12v-4"/>',
  upload:'<path d="M8 11V2M4 6l4-4 4 4M2 11v4h12v-4"/>',
  edit:'<path d="M2 11v3h3L14 5l-3-3zM9 4l3 3"/>',
  check:'<path d="M2 8l4 4L14 3"/>'
};

export function Icon(name)
{
  return '<svg class="action-icon" viewBox="0 0 16 16" width="20" height="20" '+
    'aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">'+paths[name]+'</svg>';
}
