import { coastX, roadOffset } from '../shared/landscape';
const active = new Map<string, () => void>();
function shapeArrow(height: number) {
  const y = height / 2 - 12;
  return `M10 ${2 + y} L14 ${2 + y} L14 ${5 + y} L18 ${5 + y} L18 ${9 + y} L21 ${9 + y} L21 ${13 + y} L15 ${13 + y} L15 ${22 + y} L9 ${22 + y} L9 ${13 + y} L3 ${13 + y} L3 ${9 + y} L6 ${9 + y} L6 ${5 + y} L10 ${5 + y} Z`;
}
function shapeCar(h: number) {
  return `M5 1 L19 1 L19 3 L21 3 L21 14 L21 14 L21 ${h - 7} L19 ${h - 7} L19 ${h - 2} L5 ${h - 2} L5 ${h - 7} L3 ${h - 7} L3 14 L3 14 L3 3 L5 3 Z`;
}
function shapeMiddle(h: number) {
  return `M8 5 L16 5 L16 8 L18 8 L18 14 L19 14 L19 ${h - 12} L17 ${h - 12} L17 ${h - 5} L7 ${h - 5} L7 ${h - 12} L5 ${h - 12} L5 14 L6 14 L6 8 L8 8 Z`;
}
export function cancelAllJourneys() {
  for (const finish of active.values()) finish();
}
export function cancelJourney(id: string) {
  active.get(id)?.();
}
export function parkJourney(
  id: string,
  lotId: string,
  button: HTMLElement,
  truck: boolean,
  reduce: boolean,
  hide: (id: string, on: boolean) => void,
) {
  if (reduce || active.size >= 2) return;
  const origin = button.getBoundingClientRect();
  let target = document.querySelector<HTMLElement>(`[data-spot="${id}"]`);
  const dropOff = lotId === 'general';
  const lane =
    document.querySelector<HTMLElement>(`[data-lane="${lotId}"]`) ?? (dropOff ? target : null);
  if (!target || !lane) return;
  const sprite = target.querySelector<SVGSVGElement>('svg');
  if (!sprite) return;
  const dest = sprite.getBoundingClientRect(),
    road = lane.getBoundingClientRect();
  const visible =
    dest.top > 80 &&
    dest.bottom <
      Math.min(
        window.innerHeight,
        document.querySelector('.capture-rail')?.getBoundingClientRect().top ?? window.innerHeight,
      ) -
        8 &&
    dest.left > 0 &&
    dest.right < window.innerWidth;
  const top = document.elementFromPoint(dest.left + dest.width / 2, dest.top + dest.height / 2);
  if (!visible || !top?.closest(`[data-lot-geometry="${lotId}"]`)) return;
  const overlay = document.createElement('div');
  overlay.className = 'journey';
  overlay.setAttribute('aria-hidden', 'true');
  const height = truck ? 76 : 42;
  overlay.style.height = `${height}px`;
  const color = sprite.querySelectorAll('path')[3]?.getAttribute('fill') ?? '#347d9f';
  overlay.innerHTML = `<svg viewBox="0 0 24 ${height}" shape-rendering="crispEdges"><path fill="${color}" stroke="#233b38" stroke-width="1" d="${shapeArrow(height)}"><animate attributeName="d" dur="0.2s" fill="freeze" values="${shapeArrow(height)};${shapeMiddle(height)};${shapeCar(height)}"/></path></svg>`;
  document.body.append(overlay);
  hide(id, true);
  let animation: Animation | undefined;
  let artworkTimer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => finish());
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    animation?.cancel();
    clearTimeout(artworkTimer);
    observer.disconnect();
    overlay.remove();
    hide(id, false);
    active.delete(id);
    window.removeEventListener('resize', finish);
    window.removeEventListener('scroll', finish, true);
    window.visualViewport?.removeEventListener('resize', finish);
  };
  active.set(id, finish);
  observer.observe(target.closest('.parking-grid, .drop-off-todos')!, {
    childList: true,
    subtree: true,
  });
  artworkTimer = setTimeout(() => {
    if (done) return;
    const vehicle = sprite.cloneNode(true) as SVGSVGElement;
    vehicle.style.width = '100%';
    vehicle.style.height = '100%';
    vehicle.style.filter = 'none';
    vehicle.style.transform = 'none';
    overlay.replaceChildren(vehicle);
  }, 205);
  window.addEventListener('resize', finish, { once: true });
  window.addEventListener('scroll', finish, { once: true, capture: true });
  window.visualViewport?.addEventListener('resize', finish, { once: true });
  try {
    const ox = origin.left + origin.width / 2 - 12,
      oy = origin.top + origin.height / 2 - height / 2;
    const dx = dest.left + dest.width / 2 - 12,
      dy = dest.top + dest.height / 2 - height / 2;
    const roadY = road.top + road.height / 2 - height / 2;
    const map = document.querySelector('.map-scroll');
    const desktop = matchMedia('(min-width:1000px)').matches;
    const world = target.closest('.mini-world, .drop-off-plot')!.getBoundingClientRect();
    const laneX = desktop
      ? Math.max((map?.getBoundingClientRect().left ?? 0) + 6, world.left - 22)
      : Math.min(window.innerWidth - 8, world.right + 12);
    const point = (x: number, y: number, r: number) => `translate(${x}px,${y}px) rotate(${r}deg)`;
    const worldElement = document.querySelector<HTMLElement>('.landscape[data-world-width]');
    const frames: Keyframe[] = [];
    if (worldElement) {
      const bounds = worldElement.getBoundingClientRect(),
        width = Number(worldElement.dataset.worldWidth),
        offset = roadOffset(Number(worldElement.dataset.worldWidth));
      const startY = oy + height / 2 - 30 - bounds.top,
        endY = road.top + road.height / 2 - bounds.top;
      const roadPoint = (y: number) => ({
        x: bounds.left + coastX(y, width, map?.scrollTop ?? 0) + offset - 12,
        y: bounds.top + y - height / 2,
      });
      const entry = roadPoint(startY);
      frames.push(
        { transform: point(ox, oy, 0), offset: 0 },
        { transform: point(ox, oy, 0), offset: 0.22 },
        { transform: point(ox, oy - 30, entry.x >= ox ? 90 : -90), offset: 0.31 },
      );
      for (let n = 0; n <= 6; n++) {
        const t = n / 6,
          y = startY + (endY - startY) * t,
          p = roadPoint(y),
          derivative =
            (coastX(y + 3, width, map?.scrollTop ?? 0) -
              coastX(y - 3, width, map?.scrollTop ?? 0)) /
            6,
          heading = (-Math.atan(derivative) * 180) / Math.PI;
        frames.push({ transform: point(p.x, p.y, heading), offset: 0.42 + t * 0.34 });
      }
      const final = roadPoint(endY);
      frames.push(
        { transform: point(dx, roadY, dx >= final.x ? 90 : -90), offset: 0.89 },
        { transform: point(dx, dy, dropOff ? -90 : 0), offset: 1 },
      );
    } else
      frames.push(
        { transform: point(ox, oy, 0), offset: 0 },
        { transform: point(ox, oy, 0), offset: 0.22 },
        { transform: point(ox, oy - 32, laneX >= ox ? 90 : -90), offset: 0.3 },
        { transform: point(laneX, oy - 32, laneX >= ox ? 90 : -90), offset: 0.47 },
        { transform: point(laneX, roadY, 0), offset: 0.65 },
        { transform: point(dx, roadY, dx >= laneX ? 90 : -90), offset: 0.84 },
        { transform: point(dx, dy, dropOff ? -90 : 0), offset: 1 },
      );
    animation = overlay.animate(frames, { duration: 900, easing: 'linear', fill: 'forwards' });
    animation.finished
      .then(() => {
        target
          ?.closest('.lot-plot')
          ?.animate([{ outlineColor: '#d6ac5b' }, { outlineColor: 'transparent' }], {
            duration: 240,
          });
        finish();
      })
      .catch(finish);
  } catch {
    finish();
  }
  return finish;
}
// Completion uses the same cancellation registry as capture: Undo, navigation,
// scrolling and resize must never leave a detached car travelling over a new view.
export function departureSnapshot(element: HTMLElement) {
  const sprite = element.querySelector<SVGSVGElement>('svg');
  if (!sprite) return null;
  return {
    sprite: sprite.cloneNode(true) as SVGSVGElement,
    rect: sprite.getBoundingClientRect(),
    sideways: element.classList.contains('todo-complete'),
  };
}
export function driveOff(
  snapshot: ReturnType<typeof departureSnapshot>,
  reduce: boolean,
  id: string,
) {
  if (reduce || !snapshot) return;
  cancelJourney(id);
  const { sprite, rect, sideways } = snapshot;
  const ghost = document.createElement('div');
  ghost.className = 'drive-off';
  ghost.setAttribute('aria-hidden', 'true');
  const car = sprite;
  const width = sideways ? rect.height : rect.width;
  const height = sideways ? rect.width : rect.height;
  Object.assign(ghost.style, {
    left: `${rect.left + rect.width / 2 - width / 2}px`,
    top: `${rect.top + rect.height / 2 - height / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  Object.assign(car.style, {
    width: '100%',
    height: '100%',
    transform: 'rotate(-90deg)',
    margin: '0',
  });
  ghost.append(car);
  document.body.append(ghost);
  let animation: Animation | undefined;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    animation?.cancel();
    ghost.remove();
    active.delete(id);
    window.removeEventListener('resize', finish);
    window.removeEventListener('scroll', finish, true);
    window.visualViewport?.removeEventListener('resize', finish);
  };
  active.set(id, finish);
  window.addEventListener('resize', finish, { once: true });
  window.addEventListener('scroll', finish, { once: true, capture: true });
  window.visualViewport?.addEventListener('resize', finish, { once: true });
  try {
    animation = ghost.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(-${rect.left + rect.width + 16}px)`, opacity: 1 },
      ],
      { duration: 280, easing: 'cubic-bezier(0.23,1,0.32,1)', fill: 'forwards' },
    );
    animation.finished.then(finish, finish);
  } catch {
    finish();
  }
}
