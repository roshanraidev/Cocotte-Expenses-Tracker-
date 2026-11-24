export default function MethodPresentation({ text }: { text: string }) {
  return (
    <div className="recipe-service-method">
      {text.split(/(\r\n|\r|\n)/).map((part, index) => {
        if (/^(\r\n|\r|\n)$/.test(part)) return part;
        if (part === 'Before Service' || part === 'On Order') {
          return <span key={index} className="recipe-method-label">{part}</span>;
        }
        if (!part.trim()) {
          return <span key={index} className="recipe-method-space">{part}</span>;
        }

        const numbered = part.match(/^(\s*(\d+)[.)]\s+)([\s\S]*)$/);
        return (
          <span key={index} className="recipe-method-line">
            {numbered ? (
              <>
                <span className="recipe-step-number">
                  <span className="sr-only">{numbered[1]}</span>
                  <span aria-hidden="true" data-step={numbered[2].padStart(2, '0')} />
                </span>
                <span>{numbered[3]}</span>
              </>
            ) : part}
          </span>
        );
      })}
    </div>
  );
}
