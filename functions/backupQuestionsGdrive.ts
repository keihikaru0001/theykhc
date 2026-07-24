import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json().catch(() => ({}));
    const accessToken = body.accessToken;

    if (!accessToken) {
      return new Response(JSON.stringify({ status: "error", message: "Missing accessToken" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    const base44 = createClientFromRequest(req);

    // Read ALL Question records (list() with no args returns all)
    const allRecords: any[] = await base44.asServiceRole.entities.Question.list();

    const today = new Date().toISOString().split('T')[0];
    const fileName = `TheYKHC_Questions_Backup_${today}.json`;

    const backupData = {
      export_date: new Date().toISOString(),
      entity: "Question",
      total_count: allRecords.length,
      records: allRecords
    };

    const jsonStr = JSON.stringify(backupData, null, 2);

    // Search for TheYKHC folder
    let folderId: string | null = null;
    try {
      const folderQuery = encodeURIComponent("name='TheYKHC' and mimeType='application/vnd.google-apps.folder' and trashed=false");
      const folderResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${folderQuery}`,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      );
      const folderData = await folderResponse.json();
      if (folderData.files && folderData.files.length > 0) {
        folderId = folderData.files[0].id;
      }
    } catch (e) {
      // Folder search failed, will upload to root
    }

    // Upload to Google Drive via multipart
    const metadata: any = {
      name: fileName,
      mimeType: "application/json"
    };
    if (folderId) {
      metadata.parents = [folderId];
    }

    const boundary = "-------backup_boundary_" + Date.now();
    const multipartBody =
      `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      `--${boundary}\r\n` +
      "Content-Type: application/json\r\n\r\n" +
      jsonStr + "\r\n" +
      `--${boundary}--`;

    const uploadResponse = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      }
    );

    const uploadResult = await uploadResponse.json();

    if (!uploadResponse.ok) {
      return new Response(JSON.stringify({
        status: "error",
        message: "Google Drive upload failed",
        details: uploadResult
      }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      status: "ok",
      total_records: allRecords.length,
      file_id: uploadResult.id,
      file_name: uploadResult.name,
      file_url: uploadResult.webViewLink || `https://drive.google.com/file/d/${uploadResult.id}/view`,
      folder_id: folderId || "root"
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({
      status: "error",
      message: error.message,
      stack: error.stack
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
