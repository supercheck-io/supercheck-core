import { Cpu, Lock, Sparkles, Zap } from 'lucide-react'

export default function FeaturesSection() {
    return (
        <section className="py-16 md:py-32">
            <div className="mx-auto max-w-5xl space-y-12 px-6">
                <div className="relative mx-auto grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-gray-200/30 dark:border-gray-800/30 bg-white/95 dark:bg-gray-950/95 p-6 space-y-3">
                        <div className="flex items-center gap-2">
                            <Zap className="size-4" />
                            <h3 className="text-sm font-medium">Fast</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Lightning-fast automation that helps developers and businesses innovate quickly.</p>
                    </div>
                    <div className="rounded-lg border border-gray-200/30 dark:border-gray-800/30 bg-white/95 dark:bg-gray-950/95 p-6 space-y-3">
                        <div className="flex items-center gap-2">
                            <Cpu className="size-4" />
                            <h3 className="text-sm font-medium">Powerful</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Robust infrastructure supporting enterprise-scale monitoring and automation.</p>
                    </div>
                    <div className="rounded-lg border border-gray-200/30 dark:border-gray-800/30 bg-white/95 dark:bg-gray-950/95 p-6 space-y-3">
                        <div className="flex items-center gap-2">
                            <Lock className="size-4" />
                            <h3 className="text-sm font-medium">Security</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Bank-grade security ensuring your data and processes remain protected.</p>
                    </div>
                    <div className="rounded-lg border border-gray-200/30 dark:border-gray-800/30 bg-white/95 dark:bg-gray-950/95 p-6 space-y-3">
                        <div className="flex items-center gap-2">
                            <Sparkles className="size-4" />
                            <h3 className="text-sm font-medium">AI Powered</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Advanced AI algorithms that learn and adapt to optimize your workflows.</p>
                    </div>
                </div>
            </div>
        </section>
    )
}