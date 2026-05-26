type Props = {
    label: string;
};

export function NowLine({ label }: Props) {
    return (
        <div
            role="separator"
            aria-live="polite"
            aria-label={label}
            className="flex items-center gap-0 py-1"
        >
            {/* Spacer to align with time-label column */}
            <div className="w-[60px] shrink-0" />

            {/* Axis column: dot aligned to axis */}
            <div className="relative flex w-4 shrink-0 items-center justify-center">
                <div className="h-[7px] w-[7px] rounded-full bg-accent-live" />
            </div>

            {/* Line + label */}
            <div className="flex flex-1 items-center gap-2 pl-3">
                <div className="h-px flex-1 bg-accent-live" />
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent-live">
                    {label}
                </span>
            </div>
        </div>
    );
}
