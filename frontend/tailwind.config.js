/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ['class'],
    content: [
        './index.html',
        './src/**/*.{ts,tsx,js,jsx}',
    ],
    theme: {
    	extend: {
    		colors: {
    			accent: {
    				DEFAULT: 'hsl(var(--accent))',
    				foreground: 'hsl(var(--accent-foreground))'
    			},
    			background: 'hsl(var(--background))',
    			foreground: 'hsl(var(--foreground))',
    			muted: {
    				DEFAULT: 'hsl(var(--muted))',
    				foreground: 'hsl(var(--muted-foreground))'
    			},
    			border: 'hsl(var(--border))',
    			card: {
    				DEFAULT: 'hsl(var(--card))',
    				foreground: 'hsl(var(--card-foreground))'
    			},
    			destructive: {
    				DEFAULT: 'hsl(var(--destructive))',
    				foreground: 'hsl(var(--destructive-foreground))'
    			},
    			glass: {
    				DEFAULT: 'var(--glass-bg)',
    				border: 'var(--glass-border)'
    			},
    			popover: {
    				DEFAULT: 'hsl(var(--popover))',
    				foreground: 'hsl(var(--popover-foreground))'
    			},
    			primary: {
    				DEFAULT: 'hsl(var(--primary))',
    				foreground: 'hsl(var(--primary-foreground))'
    			},
    			secondary: {
    				DEFAULT: 'hsl(var(--secondary))',
    				foreground: 'hsl(var(--secondary-foreground))'
    			},
    			input: 'hsl(var(--input))',
    			ring: 'hsl(var(--ring))',
    			chart: {
    				'1': 'hsl(var(--chart-1))',
    				'2': 'hsl(var(--chart-2))',
    				'3': 'hsl(var(--chart-3))',
    				'4': 'hsl(var(--chart-4))',
    				'5': 'hsl(var(--chart-5))'
    			}
    		},
    		borderRadius: {
    			lg: 'var(--radius)',
    			md: 'calc(var(--radius) - 2px)',
    			sm: 'calc(var(--radius) - 4px)'
    		},
    		fontFamily: {
    			sans: [
    				'Inter',
    				'system-ui',
    				'-apple-system',
    				'BlinkMacSystemFont',
    				'Segoe UI',
    				'sans-serif'
    			],
    			mono: [
    				'JetBrains Mono',
    				'Menlo',
    				'monospace'
    			]
    		},
    		boxShadow: {
    			'glass-sm': 'var(--glass-shadow-sm)',
    			glass: 'var(--glass-shadow)',
    			'glass-lg': 'var(--glass-shadow-lg)',
    			'glass-inset': 'inset 0 1px 1px hsla(0, 0%, 100%, 0.1)'
    		},
    		backdropBlur: {
    			glass: 'var(--glass-blur)',
    			'glass-sm': 'var(--glass-blur-sm)',
    			'glass-lg': 'var(--glass-blur-lg)'
    		},
    		animation: {
    			'fade-in': 'fadeIn 300ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
    			'slide-up': 'slideUp 400ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
    			'slide-in-right': 'slideInRight 300ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
    			'scale-in': 'scaleIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
    			blink: 'blink 1s step-end infinite',
    			blob: 'blob 7s infinite'
    		},
    		keyframes: {
    			fadeIn: {
    				'0%': {
    					opacity: '0'
    				},
    				'100%': {
    					opacity: '1'
    				}
    			},
    			slideUp: {
    				'0%': {
    					opacity: '0',
    					transform: 'translateY(12px)'
    				},
    				'100%': {
    					opacity: '1',
    					transform: 'translateY(0)'
    				}
    			},
    			slideInRight: {
    				'0%': {
    					opacity: '0',
    					transform: 'translateX(-12px)'
    				},
    				'100%': {
    					opacity: '1',
    					transform: 'translateX(0)'
    				}
    			},
    			scaleIn: {
    				'0%': {
    					opacity: '0',
    					transform: 'scale(0.95)'
    				},
    				'100%': {
    					opacity: '1',
    					transform: 'scale(1)'
    				}
    			},
    			blink: {
    				'50%': {
    					opacity: '0'
    				}
    			},
    			blob: {
    				'0%': {
    					transform: 'translate(0px, 0px) scale(1)'
    				},
    				'33%': {
    					transform: 'translate(30px, -50px) scale(1.1)'
    				},
    				'66%': {
    					transform: 'translate(-20px, 20px) scale(0.9)'
    				},
    				'100%': {
    					transform: 'translate(0px, 0px) scale(1)'
    				}
    			}
    		},
    		transitionTimingFunction: {
    			'apple-ease': 'cubic-bezier(0.32, 0.72, 0, 1)',
    			'apple-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)'
    		}
    	}
    },
    plugins: [require('tailwindcss-animate')],
}
