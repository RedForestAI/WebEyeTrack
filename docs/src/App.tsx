import React from "react";
import { Menu, Github } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "./components/ui/navigation-menu";
import { Button } from "./components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./components/ui/sheet";
import { Separator } from "./components/ui/separator";
import { CodeBlock } from "./components/ui/code-block"
import { InlineCode } from "./components/ui/inline-code"
import { AvatarCard } from "./components/ui/avatar-card";
import { YouTubeEmbed } from "./components/ui/youtube-embed";

// https://gist.github.com/SheldonWangRJT/8d3f44a35c8d1386a396b9b49b43c385

// If you're using Vite/CRA asset imports, replace with your logo path or remove
// import logo from "./logo.svg";

/**
 * Single-page App scaffold for the WebEyeTrack site
 * - Top fixed navbar built with shadcn/ui
 * - Smooth in-page scrolling to sections
 * - Mobile menu via <Sheet>
 * - Accessible, keyboard-friendly nav
 */

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "installation", label: "Installation" },
  { id: "usage", label: "Usage" },
  { id: "examples", label: "Examples" },
  { id: "publications", label: "Publications" },
  { id: "team", label: "Our Team" },
  { id: "acknowledgements", label: "Acknowledgements" },
  { id: "licensing", label: "Licensing" },
] as const;

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function DesktopNav() {
  return (
    <NavigationMenu className="hidden md:flex">
      <NavigationMenuList>
        {SECTIONS.map((s) => (
          <NavigationMenuItem key={s.id}>
            <NavigationMenuLink asChild>
              <Button
                variant="ghost"
                size="sm"
                className="font-medium"
                onClick={() => scrollToId(s.id)}
              >
                {s.label}
              </Button>
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <div className="mt-6 space-y-2">
          {SECTIONS.map((s) => (
            <Button
              key={s.id}
              variant="ghost"
              className="w-full justify-start text-base"
              onClick={() => {
                scrollToId(s.id);
                // Close the sheet by clicking the overlay programmatically
                const overlay = document.querySelector<HTMLElement>(
                  "[data-state='open'][data-radix-sheet-override]"
                );
                overlay?.click();
              }}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ id, title, children }: React.PropsWithChildren<{ id: string; title: string }>) {
  return (
    <section
      id={id}
      className="scroll-mt-24 md:scroll-mt-28 py-6"
      aria-label={title}
    >
      <div className="container mx-auto max-w-5xl px-4">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">{title}</h2>
        <Separator className="mb-6 mt-2" />
        <div className="prose prose-zinc dark:prose-invert max-w-none">
          {children}
        </div>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground w-full">
      {/* Fixed top bar */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex h-16 md:h-20 items-center justify-between gap-3">
            {/* Brand */}
            <div className="flex items-center gap-3">
              {/* Uncomment if you have a logo asset */}
              {/* <img src={logo} alt="WebEyeTrack logo" className="h-7 w-7" /> */}
              <a
                href="#hero"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId("hero");
                }}
                className="text-lg md:text-xl font-bold"
              >
                WebEyeTrack
              </a>
            </div>

            <DesktopNav />
            <div className="flex items-center gap-2">
              <a
                href="https://github.com/RedForestAI/WebEyeTrack"
                target="_blank"
                rel="noreferrer noopener"
                className="hidden sm:inline-flex"
              >
                <Button variant="outline" size="sm" className="gap-2">
                  <Github className="h-4 w-4" />
                  GitHub
                </Button>
              </a>
              <MobileNav />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main>
        {/* Hero Banner with WebEyeTrack slogan*/}
        <div id="hero" className="scroll-mt-24 bg-gradient-to-b from-blue-600 to-indigo-600 text-white">
          <div className="container mx-auto max-w-6xl px-4 py-20 text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              WebEyeTrack
            </h1>
            <p className="mt-4 text-lg md:text-xl">
              Real-time, web-native eye tracking toolkit
            </p>
          </div>
        </div>

        <Section id="overview" title="Overview">

            <div className="mb-6">

              <YouTubeEmbed
                src="https://www.youtube.com/watch?v=EhFJplhuQGY" // or just "YOUR_VIDEO_ID"
                title="WebEyeTrack demo"
                aspect="16/9"      // or "4/3" | "1/1" | "56.25%" custom
                lite               // renders a thumbnail until clicked (performance)
                autoplay           // start playback after click
              />

              {/* https://youtu.be/EhFJplhuQGY */}
              {/* <img src={`${import.meta.env.BASE_URL}/demo.gif`} alt="WebEyeTrack demo screenshot" className="rounded-lg border w-full" /> */}
              <Button className="w-full mt-4" variant="outline" size="lg">
                <a href="https://koyukan.github.io/WebEyeTrack/demo/" target="_blank" rel="noreferrer noopener" className="w-full">
                Click to use live demo
                </a>
              </Button>
            </div>

            <div className="flex flex-col md:flex-row gap-4">

              <div className="md:w-1/2">
                <p>
                <strong>WebEyeTrack</strong> brings deep‑learning gaze estimation to the web browser and
                explicitly accounts for <em>head pose</em>. No plugins, no cloud. Our framework runs entirely
                on‑device (TensorFlow.js), pairing a lightweight CNN gaze model (BlazeGaze) with a
                novel metric head‑pose pipeline built from 3D face reconstruction and radial Procrustes
                alignment. With as few as <strong>9 calibration points</strong>, it adapts to each user and stays robust
                under natural head motion.
                </p>
                <p className="pt-4">
                In evaluations on standard datasets, WebEyeTrack achieves state‑of‑the‑art‑level accuracy
                while maintaining real‑time performance on commodity devices. The result is a private,
                scalable, and portable eye‑tracking solution designed for researchers and developers who need
                reliable, deployable gaze estimation in the browser.
                </p>
              </div>
              <ul className="gap-2 md:w-1/2">
              <li><strong>Browser‑native</strong>: deep learning gaze estimation running locally for privacy.</li>
              <li><strong>Head‑pose aware</strong>: explicit metric head pose improves stability during movement.</li>
              <li><strong>Few‑shot personalization</strong>: k ≤ 9 samples for fast per‑user adaptation.</li>
              <li><strong>Lightweight</strong>: compact CNN designed for real‑time inference across devices.</li>
              <li><strong>Open‑source</strong>: built for reproducibility and extensibility.</li>
              </ul>
            </div>
            {/* WebEyeTrack is a lightweight, web-native eye tracking toolkit. Use this */}
            {/* space to describe the motivation, core ideas, and a visual teaser. */}
        </Section>

        <Section id="installation" title="Installation">
          <div className="space-y-4">
            <p>Install the JavaScript package running the following command:</p>
            <CodeBlock
              language="bash"
              code={`npm install webeyetrack`}
            />
            <p>You can find our NPM package <InlineCode className="text-blue-600!"> <a href="https://www.npmjs.com/package/webeyetrack">here</a> </InlineCode>.</p>
          </div>
        </Section>

        <Section id="usage" title="Usage">
          <div className="space-y-4">
            <p>
            To use WebEyeTrack, we provide a webcam client solution to support the streaming of frames into the tracker.
            </p>
            <CodeBlock
              language="javascript/typescript"
              code={`import { WebcamClient, WebEyeTrackProxy } from 'webeyetrack'\nconst webcamClient = new WebcamClient('video'); // id of HTMLVideoElement\nconst webEyeTrackProxy = new WebEyeTrackProxy(webcamClient);`}
            />
            <p>
            Then you define the callback function once gaze estimation results are available:
            </p>
            <CodeBlock
              language="javascript/typescript"
              code={`webEyeTrackProxy.onGazeResults = (gazeResult: GazeResult) => {\n  console.log(gazeResult)\n}`}
            />
            <p>
            Then make sure to copy and paste the <InlineCode className="text-blue-600!"> <a href="https://github.com/RedForestAI/WebEyeTrack/tree/main/js/examples/minimal-example/public/web">web</a> </InlineCode> folder into your <InlineCode>public</InlineCode> folder of your application. The <InlineCode>web</InlineCode> folder includes the trained TF.js model weights for the BlazeGaze gaze-estimation model.
            </p>
          </div>
        </Section>

        <Section id="examples" title="Examples">
          <div className="flex flex-col gap-4">
            <p>
              We provide two examples to get you started:
            </p>
            <ul className="list-disc pl-5">
              <li>
                <strong>Minimal Code Example:</strong> A minimal setup to demonstrate the core functionality of WebEyeTrack.
              </li>
              <li>
                <strong>Full Demo:</strong> A more complex application visualizing the input and output of gaze estimation.
              </li>
            </ul>
            <p>
              You can find the examples in the <InlineCode className="text-blue-600!"> <a href="https://github.com/RedForestAI/WebEyeTrack/tree/main/js/examples">examples</a> </InlineCode> directory of the repository.
            </p>
          </div>
        </Section>

        <Section id="publications" title="Publications">
          <div className="space-y-4">
            <p> If you would like to cite this work, please use the following reference:</p>
            <CodeBlock
              language="bibtex"
              code={`@misc{davalos2025webeyetrack,\n\ttitle={WEBEYETRACK: Scalable Eye-Tracking for the Browser via On-Device Few-Shot Personalization},\n\tauthor={Eduardo Davalos and Yike Zhang and Namrata Srivastava and Yashvitha Thatigotla and Jorge A. Salas and Sara McFadden and Sun-Joo Cho and Amanda Goodwin and Ashwin TS and Gautam Biswas},\n\tyear={2025},\n\teprint={2508.19544},\n\tarchivePrefix={arXiv},\n\tprimaryClass={cs.CV},\n\turl={https://arxiv.org/abs/2508.19544}\n}`} />
          </div>
        </Section>

        <Section id="team" title="Our Team">
          {/* <p>
            Introduce the authors and contributors. Add avatars/cards if you like.
          </p> */}
          {/* <AvatarCard
            name="Ava Reyes"
            href="https://example.com/ava"
            subtitle="PhD Candidate, HCI"
            imageSrc="/team/ava.jpg"
            imageAlt="Portrait of Ava Reyes"
            external
          >
            Works on calibration robustness and head-pose modeling.
          </AvatarCard> */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AvatarCard
              name="Eduardo Davalos"
              href="https://edavalosanaya.github.io"
              subtitle="Assistant Professor, AIED | HCI | LLMs"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/eduardo_davalos.webp`}
              external
            />
            <AvatarCard
              name="Yike Zhang"
              href="https://yikezhang.me"
              subtitle="Assistant Professor, Healthcare Ed | LLMs"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/yike_zhang.jpeg`}
              external
            />
            <AvatarCard
              name="Namrata Srivastava"
              href="https://sites.google.com/view/namrata-srivastava"
              subtitle="Postdoc, HCI"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/namrata_srivastava.jpeg`}
              external
            />
            <AvatarCard
              name="Yashvitha Thatigotla"
              href="https://www.linkedin.com/in/yashvitha/"
              subtitle="Software Dev @ Optum"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/yashvitha_thatigotla.jpeg`}
              external
            />
            <AvatarCard
              name="Jorge A. Salas"
              href="https://www.linkedin.com/in/jorgeasalas/"
              subtitle="Research Analyst"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/jorge_a_salas.jpeg`}
              external
            />
            <AvatarCard
              name="Sara McFadden"
              href="https://www.linkedin.com/in/sara-mcfadden-93162a4/"
              subtitle="Research Coordinator"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/sara_mcfadden.png`}
              external
            />
            <AvatarCard
              name="Sun-Joo Cho"
              href="https://scholar.google.com/citations?user=0SHxelgAAAAJ&hl=en"
              subtitle="Professor | Psychology & Human Development"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/sunjoo_cho.jpg`}
              external
            />
            <AvatarCard
              name="Amanda Goodwin"
              href="https://peabody.vanderbilt.edu/bio/?pid=amanda-goodwin"
              subtitle="Professor | Language & Literacy"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/amanda_goodwin.jpg`}
              external
            />
            <AvatarCard
              name="Ashwin TS"
              href="https://sites.google.com/view/ashwintudur/home"
              subtitle="Research Scientist"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/ashwin_ts.png`}
              external
            />
            <AvatarCard
              name="Gautam Biswas"
              href="https://engineering.vanderbilt.edu/bio/?pid=gautam-biswas"
              subtitle="Professor | Computer Science"
              imageSrc={`${import.meta.env.BASE_URL}/profiles/gautam_biswas.jpg`}
            >
              {/* Focus: on-device inference and eval tooling. */}
            </AvatarCard>
          </div>
        </Section>

        <Section id="acknowledgements" title="Acknowledgements">
          <p>
            The research reported here was supported by the Institute of Education Sciences, U.S. Department of Education, through Grant R305A150199 and R305A210347 to Vanderbilt University. The opinions expressed are those of the authors and do not represent views of the Institute or the U.S. Department of Education.
          </p>
        </Section>

        <Section id="licensing" title="Licensing">
          <div className="space-y-4">
            <p><strong>License:</strong> MIT.</p>
            <p>
              You are free to use, copy, modify, merge, publish, distribute, sublicense,
              and/or sell copies of WebEyeTrack, provided that the copyright and permission
              notices are included in all copies or substantial portions of the software.
              The software is provided “as is,” without warranty of any kind.
            </p>
            <p>
              <strong>Responsible use reminder:</strong> please use WebEyeTrack ethically and always
              in ways that benefit end users. Obtain informed consent for any gaze data collection,
              respect privacy (store the minimum necessary data and secure it), be transparent
              about how data is used, and comply with applicable laws, institutional review board
              requirements, and platform policies. Do not use the software to harm, surveil without
              consent, or discriminate.
            </p>
            <p>
              See the <code>LICENSE</code> file in the repository for the full text.
            </p>
          </div>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto max-w-6xl px-4 text-sm text-muted-foreground">
          © {new Date().getFullYear()} WebEyeTrack Team. All rights reserved.
        </div>
      </footer>

      {/* Back to top */}
      <div className="fixed bottom-5 right-5">
        <Button
          variant="secondary"
          onClick={() => scrollToId("hero")}
          className="shadow-lg"
        >
          Back to top
        </Button>
      </div>
    </div>
  );
}
