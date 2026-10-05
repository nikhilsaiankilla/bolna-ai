export function BolnaLogo({ className = "w-6 h-6" }: { className?: string }) {
    return (
        <img
            src="https://platform.bolna.ai/images/bolna-logo.png"
            alt="Bolna Logo"
            className={`${className} object-contain`}
        />
    );
}