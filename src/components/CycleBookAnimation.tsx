const rightPage = 'M180 68 C220 46 267 39 312 47 L312 153 C267 147 220 155 180 178 Z';
const leftPage = 'M180 68 C140 46 93 39 48 47 L48 153 C93 147 140 155 180 178 Z';

// Every pose shares the same path commands and stays attached to the spine.
const pageTurn = [
  rightPage,
  'M180 68 C214 31 244 22 280 29 L292 134 C255 126 217 143 180 178 Z',
  'M180 68 C184 32 190 16 200 14 L213 116 C196 133 186 151 180 178 Z',
  'M180 68 C145 30 112 25 78 37 L67 143 C106 136 145 148 180 178 Z',
  leftPage,
  leftPage,
].join(';');

/** Ilustração decorativa do ciclo de estudos. */
export function CycleBookAnimation() {
  return (
    <svg className="cycle-book-animation" viewBox="0 0 360 220" aria-hidden="true">
      <ellipse className="cycle-book-shadow" cx="180" cy="189" rx="138" ry="13" />
      <path
        className="cycle-book-cover"
        d="M180 75 C141 52 90 45 39 53 L39 170 C89 161 141 167 180 192 C219 167 271 161 321 170 L321 53 C270 45 219 52 180 75 Z"
      />
      <path
        className="cycle-book-edges"
        d="M180 73 C141 48 94 43 45 49 L45 162 C95 155 141 163 180 186 C219 163 265 155 315 162 L315 49 C266 43 219 48 180 73 Z"
      />
      <path className="cycle-book-paper" d={leftPage} />
      <path className="cycle-book-paper" d={rightPage} />
      <path
        className="cycle-book-rule"
        d="M66 69 Q106 66 154 83 M66 83 Q106 80 154 97 M66 97 Q106 94 154 111 M66 111 Q106 108 139 118
           M294 69 Q254 66 206 83 M294 83 Q254 80 206 97 M294 97 Q254 94 206 111 M294 111 Q260 109 221 121"
      />
      <path className="cycle-book-spine" d="M180 69 V178" />
      <path className="cycle-book-turn" d={rightPage} opacity="0">
        <animate
          attributeName="d"
          dur="3.6s"
          repeatCount="indefinite"
          values={pageTurn}
          keyTimes="0;0.14;0.26;0.38;0.48;1"
          calcMode="spline"
          keySplines="0.42 0 1 1;0 0 1 1;0 0 1 1;0 0 0.58 1;0 0 1 1"
        />
        <animate
          attributeName="opacity"
          dur="3.6s"
          repeatCount="indefinite"
          values="0;1;1;0;0"
          keyTimes="0;0.08;0.41;0.51;1"
        />
      </path>
    </svg>
  );
}
