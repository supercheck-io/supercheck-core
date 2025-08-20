import React from 'react'
import Link from 'next/link'
import { ArrowRight, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { TextEffect } from '@/components/motion-primitives/text-effect'
import { AnimatedGroup } from '@/components/motion-primitives/animated-group'
import { HeroHeader } from "@/components/header"
import FooterSection from "@/components/footer"
import FeaturesSection from "@/components/features"

const transitionVariants = {
    item: {
        hidden: {
            opacity: 0,
            filter: 'blur(12px)',
            y: 12,
        },
        visible: {
            opacity: 1,
            filter: 'blur(0px)',
            y: 0,
            transition: {
                type: 'spring',
                bounce: 0.3,
                duration: 1.5,
            },
        },
    },
}

export default function HeroSection() {
    return (
        <>
            <div className="min-h-screen w-full bg-white dark:bg-gray-950 relative text-gray-800 dark:text-gray-100">
                {/* Circuit Board - Light Pattern with Fade */}
                <div
                    className="fixed inset-0 z-0 pointer-events-none dark:hidden"
                    style={{
                        backgroundImage: `
                            repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(75, 85, 99, 0.08) 19px, rgba(75, 85, 99, 0.08) 20px, transparent 20px, transparent 39px, rgba(75, 85, 99, 0.08) 39px, rgba(75, 85, 99, 0.08) 40px),
                            repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(75, 85, 99, 0.08) 19px, rgba(75, 85, 99, 0.08) 20px, transparent 20px, transparent 39px, rgba(75, 85, 99, 0.08) 39px, rgba(75, 85, 99, 0.08) 40px),
                            radial-gradient(circle at 20px 20px, rgba(55, 65, 81, 0.12) 2px, transparent 2px),
                            radial-gradient(circle at 40px 40px, rgba(55, 65, 81, 0.12) 2px, transparent 2px)
                        `,
                        backgroundSize: '40px 40px, 40px 40px, 40px 40px, 40px 40px',
                        WebkitMaskImage:
                            "radial-gradient(ellipse 65% 55% at 50% 45%, #000 50%, rgba(0,0,0,0.6) 75%, transparent 100%)",
                        maskImage:
                            "radial-gradient(ellipse 65% 55% at 50% 45%, #000 50%, rgba(0,0,0,0.6) 75%, transparent 100%)",
                    }}
                />
                {/* Circuit Board - Dark Pattern with Fade */}
                <div
                    className="fixed inset-0 z-0 pointer-events-none hidden dark:block"
                    style={{
                        backgroundImage: `
                            repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(156, 163, 175, 0.15) 19px, rgba(156, 163, 175, 0.15) 20px, transparent 20px, transparent 39px, rgba(156, 163, 175, 0.15) 39px, rgba(156, 163, 175, 0.15) 40px),
                            repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(156, 163, 175, 0.15) 19px, rgba(156, 163, 175, 0.15) 20px, transparent 20px, transparent 39px, rgba(156, 163, 175, 0.15) 39px, rgba(156, 163, 175, 0.15) 40px),
                            radial-gradient(circle at 20px 20px, rgba(209, 213, 219, 0.2) 2px, transparent 2px),
                            radial-gradient(circle at 40px 40px, rgba(209, 213, 219, 0.2) 2px, transparent 2px)
                        `,
                        backgroundSize: '40px 40px, 40px 40px, 40px 40px, 40px 40px',
                        WebkitMaskImage:
                            "radial-gradient(ellipse 65% 55% at 50% 45%, #000 50%, rgba(0,0,0,0.6) 75%, transparent 100%)",
                        maskImage:
                            "radial-gradient(ellipse 65% 55% at 50% 45%, #000 50%, rgba(0,0,0,0.6) 75%, transparent 100%)",
                    }}
                />
                <HeroHeader />
                <main className="relative overflow-hidden">
                <section className="relative z-10">
                    <div className="relative pt-32 pb-20 md:pt-48 md:pb-32">
                        <div className="mx-auto max-w-6xl px-6 relative z-20">
                            <div className="text-center mx-auto max-w-4xl">
                                <AnimatedGroup variants={transitionVariants}>
                                    <Link
                                        href="#link"
                                        className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-zinc-950/5 transition-colors duration-300 dark:border-t-white/5 dark:shadow-zinc-950">
                                        <span className="text-foreground text-sm">Introducing Support for AI Models</span>
                                        <span className="dark:border-background block h-4 w-0.5 border-l bg-white dark:bg-zinc-700"></span>

                                        <div className="bg-background group-hover:bg-muted size-6 overflow-hidden rounded-full duration-500">
                                            <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                                                <span className="flex size-6">
                                                    <ArrowRight className="m-auto size-3" />
                                                </span>
                                                <span className="flex size-6">
                                                    <ArrowRight className="m-auto size-3" />
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                </AnimatedGroup>

                                <TextEffect
                                    preset="fade-in-blur"
                                    speedSegment={0.3}
                                    as="h1"
                                    className="mt-12 text-balance text-5xl font-bold leading-tight text-gray-900 dark:text-white md:text-6xl lg:text-7xl lg:mt-16">
                                    Automation & Monitoring for Modern Apps
                                </TextEffect>
                                <TextEffect
                                    per="line"
                                    preset="fade-in-blur"
                                    speedSegment={0.3}
                                    delay={0.5}
                                    as="p"
                                    className="mx-auto mt-8 max-w-3xl text-balance text-xl leading-relaxed text-gray-600 dark:text-gray-300">
                                    Highly customizable components for building modern websites and applications that look and feel the way you mean it.
                                </TextEffect>

                                <AnimatedGroup
                                    variants={{
                                        container: {
                                            visible: {
                                                transition: {
                                                    staggerChildren: 0.05,
                                                    delayChildren: 0.75,
                                                },
                                            },
                                        },
                                        ...transitionVariants,
                                    }}
                                    className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                    <Button
                                        key={1}
                                        asChild
                                        className="rounded-full px-6 py-2 text-sm font-medium transition-colors">
                                        <Link href="#link">
                                            <span className="text-nowrap">Start Building</span>
                                        </Link>
                                    </Button>
                                    <Button
                                        key={2}
                                        asChild
                                        variant="ghost"
                                        className="rounded-full px-6 py-2 text-sm font-medium transition-colors">
                                        <Link href="https://www.youtube.com/watch?v=WvsLGZnHmzw" target="_blank" rel="noopener noreferrer">
                                            <Play className="mr-2 size-4" />
                                            <span className="text-nowrap">Watch Video</span>
                                        </Link>
                                    </Button>
                                </AnimatedGroup>
                                
                                {/* Placeholder card moved here */}
                                <div className="mt-16 mx-auto w-[85%]">
                                    <div className="aspect-[88/36] relative bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-800/50">
                                        
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </section>
            </main>
            <FeaturesSection />
            <FooterSection />
            </div>
        </>
    )
}