"use client";
import React from "react";
import { CreateCard } from "./create-card";
import { useRouter } from "next/navigation";
import {
  Video,
  Clock,
  Zap,
} from "lucide-react";
import { monitorTypes } from "@/components/monitors/data";
import { types } from "@/components/tests/data";

type ScriptType = "browser" | "api" | "custom" | "database" | "record";

export function CreatePageContent() {
  const router = useRouter();

  const handleScriptSelection = (scriptType: ScriptType) => {
    // Navigate to the playground page with the script type as a query parameter
    router.push(`/playground?scriptType=${scriptType}`);
  };

  const testTypes = [
    ...types.map((type) => ({
      icon: <type.icon size={24} className={type.color} />,
      title: type.label,
      description: `Check your crucial ${type.label.toLowerCase()} flows.`,
      path: `/create/${type.value}`,
      scriptType: type.value as ScriptType,
    })),
    {
      icon: <Video size={24} className="text-red-500" />,
      title: "Record",
      description: "Record a script via browser extension.",
      path: "https://chromewebstore.google.com/detail/playwright-crx/jambeljnbnfbkcpnoiaedcabbgmnnlcd",
      scriptType: "record" as ScriptType,
    },
  ];

  const jobTypes = [
    {
      icon: <Clock size={24} className="text-blue-500" />,
      title: "Scheduled Job",
      description: "Create a job that runs on a schedule",
      onClick: () => router.push("/jobs/create"),
    },
    {
      icon: <Zap size={24} className="text-amber-500" />,
      title: "Immediate Job",
      description: "Run a job immediately",
      onClick: () => router.push("/jobs/create"),
    },
  ];

  return (
    <div className=" mx-auto  p-4">
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
        <p className="text-muted-foreground text-sm mt-1"> Configure a new automated or manual job</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {jobTypes.map((jobType) => (
          <CreateCard
            key={jobType.title}
            icon={jobType.icon}
            title={jobType.title}
            description={jobType.description}
            onClick={jobType.onClick}
          />
        ))}
      </div>

      <div className="mt-8 mb-3 pl-1">
        <h2 className="text-xl font-bold">Create New Monitor</h2>
        <p className="text-muted-foreground text-sm mt-1">Select the type of uptime monitor you want to create</p>
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
