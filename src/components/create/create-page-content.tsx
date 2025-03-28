"use client";
import React from "react";
import { CreateCard } from "./create-card";
import { useRouter } from "next/navigation";
import {
  HelpCircle,
  Unplug,
  Chrome,
  Webhook,
  ListOrdered,
  DatabaseZap,
  Clock,
  Zap,
} from "lucide-react";

type ScriptType = "browser" | "api" | "multistep" | "database";

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
    // {
    //   icon: <Server size={24} />,
    //   title: "TCP check",
    //   description: "Monitor connectivity to TCP endpoints.",
    //   path: "/create/tcp",
    //   scriptType: "tcp" as ScriptType,
    // },
    {
      icon: <ListOrdered size={24} />,
      title: "Multistep check",
      description: "Chained API calls, requests in sequence.",
      path: "/create/multistep",
      scriptType: "multistep" as ScriptType,
    },
    {
      icon: <Unplug size={24} />,
      title: "WebSocket check",
      description: "Organize multiple tests into logical groups.",
      path: "/create/websocket",
      scriptType: "websocket" as ScriptType,
    },
    // {
    //   icon: <Clock size={24} />,
    //   title: "CRON/Heartbeat",
    //   description: "Monitor tasks that run automatically.",
    //   path: "/create/cron",
    //   scriptType: "cron" as ScriptType,
    // },
    // {
    //   icon: <Zap size={24} />,
    //   title: "Group check",
    //   description: "Organize multiple tests into logical groups.",
    //   path: "/create/group",
    //   scriptType: "group" as ScriptType,
    // },

    {
      icon: <DatabaseZap size={24} />,
      title: "Database check",
      description: "Test database connectivity and query execution.",
      path: "/create/database",
      scriptType: "database" as ScriptType,
    },

    {
      icon: <HelpCircle size={24} />,
      title: "New check type",
      description: "There is a type missing?",
      path: "#",
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-2xl font-bold">Create New Test</h2>
        <p className="text-muted-foreground">
          Select the type of test you want to create
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {testTypes.map((testType) => (
          <CreateCard
            key={testType.scriptType}
            icon={testType.icon}
            title={testType.title}
            description={testType.description}
            onClick={() =>
              handleScriptSelection(testType.scriptType as ScriptType)
            }
            className={
              testType.title === "New check type" ? "border-dashed" : ""
            }
          />
        ))}
      </div>

      <div>
        <h2 className="text-2xl font-bold">Create New Job</h2>
        <p className="text-muted-foreground">Configure a new automated job</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        <CreateCard
          icon={<Clock size={24} />}
          title="Scheduled Job"
          description="Create a job that runs on a schedule"
          onClick={() => router.push("/jobs/create")}
        />
        <CreateCard
          icon={<Zap size={24} />}
          title="Immediate Job"
          description="Run a job immediately"
          onClick={() => router.push("/jobs/create")}
        />
      </div>
    </div>
  );
}
