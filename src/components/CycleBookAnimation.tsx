/** Ilustração decorativa do ciclo de estudos. */
export function CycleBookAnimation() {
  return (
    <div className="cycle-book-animation" aria-hidden="true">
      <svg viewBox="0 0 320 220" role="presentation">
        <ellipse className="cycle-book-shadow" cx="160" cy="183" rx="115" ry="13" />
        <path className="cycle-book-cover" d="M38 61 Q95 44 158 67 L158 177 Q94 154 38 172 Z" />
        <path className="cycle-book-cover" d="M162 67 Q225 44 282 61 L282 172 Q226 154 162 177 Z" />
        <path className="cycle-book-page-base" d="M43 54 Q98 39 155 62 L155 165 Q99 145 43 162 Z" />
        <path className="cycle-book-page-base" d="M165 62 Q222 39 277 54 L277 162 Q221 145 165 165 Z" />
        <path className="cycle-book-spine" d="M157 62 Q160 68 163 62 L163 166 Q160 171 157 166 Z" />
        <path className="cycle-book-rule" d="M62 77 Q103 68 139 82 M62 91 Q102 82 139 96 M62 105 Q101 96 139 110 M62 119 Q99 110 139 124 M62 133 Q96 124 139 138" />
        <path className="cycle-book-rule" d="M181 82 Q218 68 258 77 M181 96 Q218 82 258 91 M181 110 Q219 96 258 105 M181 124 Q221 110 258 119 M181 138 Q224 124 258 133" />
        <g className="cycle-book-flip cycle-book-flip-one">
          <path className="cycle-book-flipping-page" d="M160 63 Q218 40 276 54 L276 162 Q219 145 160 166 Z" />
          <path className="cycle-book-rule" d="M179 80 Q218 68 258 77 M179 94 Q218 82 258 91 M179 108 Q219 96 258 105 M179 122 Q221 110 258 119 M179 136 Q224 124 258 133" />
        </g>
        <g className="cycle-book-flip cycle-book-flip-two">
          <path className="cycle-book-flipping-page" d="M160 63 Q218 40 276 54 L276 162 Q219 145 160 166 Z" />
          <path className="cycle-book-rule" d="M179 80 Q218 68 258 77 M179 94 Q218 82 258 91 M179 108 Q219 96 258 105 M179 122 Q221 110 258 119 M179 136 Q224 124 258 133" />
        </g>
      </svg>
    </div>
  );
}
