export default function Loader({ text = 'Loading…', compact = false }) {
    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: compact ? '12px 0' : '48px 0',
                color: 'var(--text-muted)',
                fontSize: 13.5,
            }}
        >
            <span className="spinner" />
            {text}
        </div>
    );
}