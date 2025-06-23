"use client";
import React from "react";
import { CreateCard } from "./create-card";
import { useRouter } from "next/navigation";
import {
  Chrome,
  Webhook,
  ListOrdered,
  DatabaseZap,
  Video,
  Clock,
  Zap,
} from "lucide-react";
import { monitorTypes } from "@/components/monitors/data";

type ScriptType = "browser" | "api" | "multistep" | "database" | "record";

export function CreatePageContent() {
  const router = useRouter();

  const handleScriptSelection = (scriptType: ScriptType) => {
    // Navigate to the playground page with the script type as a query parameter
    router.push(`/playground?scriptType=${scriptType}`);
  };

  const testTypes = [
    {
      icon: <Chrome size={24} className="text-green-500" />,
      title: "Browser check",
      description: "Check your crucial browser click flows.",
      path: "/create/browser",
      scriptType: "browser" as ScriptType,
    },
    {
      icon: <Webhook size={24} className="text-purple-500" />,
      title: "API check",
      description: "Check speed and validity of API endpoints.",
      path: "/create/api",
      scriptType: "api" as ScriptType,
    },

    {
      icon: <ListOrdered size={24} className="text-orange-500" />,
      title: "Multistep check",
      description: "Chained API calls, requests in sequence.",
      path: "/create/multistep",
      scriptType: "multistep" as ScriptType,
    },


    {
      icon: <DatabaseZap size={24} className="text-yellow-500" />,
      title: "Database check",
      description: "Test database query execution.",
      path: "/create/database",
      scriptType: "database" as ScriptType,
    },

    {
      icon: <Video size={24} className="text-red-500" />,
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
          icon={<Clock size={24} className="text-blue-500" />}
          title="Scheduled Job"
          description="Create a job that runs on a schedule"
          onClick={() => router.push("/jobs/create")}
        />
        <CreateCard
          key="immediate-job"
          icon={<Zap size={24} className="text-amber-500" />}
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
        {monitorTypes.map((monitorType) => {
          const IconComponent = monitorType.icon;
          return (
            <CreateCard
              key={monitorType.value}
              icon={<IconComponent size={24} className={monitorType.color} />}
              title={monitorType.label}
              description={monitorType.description}
              onClick={() => router.push(`/monitors/create?type=${monitorType.value}`)}
            />
          );
        })}
      </div>


    </div>
  );
}
