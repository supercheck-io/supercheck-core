import Link from 'next/link'

const links = [
    {
        group: 'Product',
        items: [
            {
                title: 'Features',
                href: '#',
            },
            {
                title: 'Solution',
                href: '#',
            },
            {
                title: 'Pricing',
                href: '#',
            },
        ],
    },
    {
        group: 'Solution',
        items: [
            {
                title: 'Startup',
                href: '#',
            },
            {
                title: 'Organizations',
                href: '#',
            },
            {
                title: 'Enterprise',
                href: '#',
            },
        ],
    },
    {
        group: 'Company',
        items: [
            {
                title: 'About',
                href: '#',
            },
            {
                title: 'Careers',
                href: '#',
            },
            {
                title: 'Contact',
                href: '#',
            },
        ],
    },
    {
        group: 'Legal',
        items: [
            {
                title: 'Privacy',
                href: '#',
            },
            {
                title: 'Terms',
                href: '#',
            },
            {
                title: 'Security',
                href: '#',
            },
        ],
    },
]

export default function FooterSection() {
    return (
        <footer className="relative z-30 bg-gradient-to-t from-white/95 to-white/80 backdrop-blur-sm pt-8 pb-6 dark:bg-gradient-to-t dark:from-gray-950/95 dark:to-gray-950/80">
            <div className="mx-auto max-w-5xl px-6">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {links.map((link, index) => (
                        <div
                            key={index}
                            className="space-y-3 text-sm">
                            <span className="block font-medium">{link.group}</span>
                            {link.items.map((item, index) => (
                                <Link
                                    key={index}
                                    href={item.href}
                                    className="text-muted-foreground hover:text-primary block duration-150">
                                    <span>{item.title}</span>
                                </Link>
                            ))}
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <span className="text-muted-foreground order-last block text-center text-sm md:order-first">© {new Date().getFullYear()} Supercheck, All rights reserved</span>
                    <div className="order-first flex flex-wrap justify-center gap-3 text-sm md:order-last">
                        <Link
                            href="#"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="X/Twitter"
                            className="text-muted-foreground hover:text-primary block">
                            <svg
                                className="size-6"
                                xmlns="http://www.w3.org/2000/svg"
                                width="1em"
                                height="1em"
                                viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M10.488 14.651L15.25 21h7l-7.858-10.478L20.93 3h-2.65l-5.117 5.886L8.75 3h-7l7.51 10.015L2.32 21h2.65zM16.25 19L5.75 5h2l10.5 14z"></path>
                            </svg>
                        </Link>
                        <Link
                            href="#"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="YouTube"
                            className="text-muted-foreground hover:text-primary block">
                            <svg
                                className="size-6"
                                xmlns="http://www.w3.org/2000/svg"
                                width="1em"
                                height="1em"
                                viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path>
                            </svg>
                        </Link>
                        <Link
                            href="#"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="GitHub"
                            className="text-muted-foreground hover:text-primary block">
                            <svg
                                className="size-6"
                                xmlns="http://www.w3.org/2000/svg"
                                width="1em"
                                height="1em"
                                viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path>
                            </svg>
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    )
}