"use client";
import React from "react";
import { CreateCard } from "./create-card";
import { useRouter } from "next/navigation";
import {
  Chrome,
  Webhook,
  ListOrdered,
  DatabaseZap,
  Clock,
  Zap,
  Video,
  Globe,
  PanelTop,
  RefreshCw,
  Network,
  Heart,
  Shield,
  SquareActivity,
  Monitor,
} from "lucide-react";

type ScriptType = "browser" | "api" | "multistep" | "database" | "record";

export function CreatePageContent() {
  const router = useRouter();

  const handleScriptSelection = (scriptType: ScriptType) => {
    // Navigate to the playground page with the script type as a query parameter
    router.push(`/playground?scriptType=${scriptType}`);
  };

  const testTypes = [
    {
      icon: <Chrome size={24} />,
      title: "Browser check",
      description: "Check your crucial browser click flows.",
      path: "/create/browser",
      scriptType: "browser" as ScriptType,
    },
    {
      icon: <Webhook size={24} />,
      title: "API check",
      description: "Check speed and validity of API endpoints.",
      path: "/create/api",
      scriptType: "api" as ScriptType,
    },

    {
      icon: <ListOrdered size={24} />,
      title: "Multistep check",
      description: "Chained API calls, requests in sequence.",
      path: "/create/multistep",
      scriptType: "multistep" as ScriptType,
    },


    {
      icon: <DatabaseZap size={24} />,
      title: "Database check",
      description: "Test database query execution.",
      path: "/create/database",
      scriptType: "database" as ScriptType,
    },

    {
      icon: <Video size={24} />,
      title: "Record",
      description: "Record a script via browser extension.",
      path: "https://chromewebstore.google.com/detail/playwright-crx/jambeljnbnfbkcpnoiaedcabbgmnnlcd",
      scriptType: "record" as ScriptType,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      <div className="mb-3 pl-1">
        <h2 className="text-xl font-bold">Create New Test</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Select the type of test you want to create
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {testTypes.map((testType) => (
          <CreateCard
            key={testType.scriptType || testType.title}
            icon={testType.icon}
            title={testType.title}
            description={testType.description}
            onClick={() =>
              testType.title === "Record"
                ? window.open(testType.path, "_blank")
                : testType.scriptType
                ? handleScriptSelection(testType.scriptType as ScriptType)
                : undefined
            }
            className={
              testType.title === "Record" ? "border-dashed" : ""
            }
          />
        ))}
      </div>

      <div className="mt-8 mb-3 pl-1">
        <h2 className="text-xl font-bold">Create New Job</h2>
        <p className="text-muted-foreground text-sm mt-1">Configure a new automated job</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        <CreateCard
          key="scheduled-job"
          icon={<Clock size={24} />}
          title="Scheduled Job"
          description="Create a job that runs on a schedule"
          onClick={() => router.push("/jobs/create")}
        />
        <CreateCard
          key="immediate-job"
          icon={<Zap size={24} />}
          title="Immediate Job"
          description="Run a job immediately"
          onClick={() => router.push("/jobs/create")}
        />
      </div>

      <div className="mt-8 mb-3 pl-1">
        <h2 className="text-xl font-bold">Create New Monitor</h2>
        <p className="text-muted-foreground text-sm mt-1">Select the type of monitor you want to create</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        <CreateCard
          key="http-monitor"
          icon={<Globe size={24} />}
          title="HTTP Monitor"
          description="HTTP/S API availability and performance"
          onClick={() => router.push("/monitors/create/http-request")}
        />
        <CreateCard
          key="website-monitor"
          icon={<Monitor size={24} />}
          title="Website Monitor"
          description="Monitor website availability and performance"
          onClick={() => router.push("/monitors/create/website")}
        />
        <CreateCard
          key="ping-monitor"
          icon={<RefreshCw size={24} />}
          title="Ping Monitor"
          description="ICMP ping to check host availability"
          onClick={() => router.push("/monitors/create/ping-host")}
        />
        <CreateCard
          key="port-monitor"
          icon={<Network size={24} />}
          title="Port Monitor"
          description="Check specific TCP or UDP port availability"
          onClick={() => router.push("/monitors/create/port-check")}
        />
        <CreateCard
          key="heartbeat-monitor"
          icon={<SquareActivity size={24} />}
          title="Heartbeat Monitor"
          description="Passive monitoring expecting regular pings"
          onClick={() => router.push("/monitors/create/heartbeat")}
        />

      </div>


    </div>
  );
}
