<?php

/**
 * upload file
 * 
 * TODO: if this is included only to execute churchcore__uploadfile why not remove the surrounding function and include the code only?
 */
function churchcore__uploadfile() {
  global $files_dir, $config;
  // list of valid extensions, ex. array("jpeg", "xml", "bmp")
  $allowedExtensions = array ();
  // max file size in bytes
  
  $sizeLimit = ($s = getConf("max_uploadfile_size_kb")) ? ($s * 1024) : (10 * 1024 * 1024);

  $uploader = new qqFileUploader($allowedExtensions, $sizeLimit);
  $file_dir = $files_dir . "/files/" . getVar("domain_type") . "/";
  if ($id = getVar("domain_id")) $file_dir .= $id;
  if (!file_exists($file_dir)) mkdir($file_dir, 0777, true);
  $result = $uploader->handleUpload($file_dir . "/");
  // to pass data through iframe you will need to encode all html tags
  echo htmlspecialchars(json_encode($result), ENT_NOQUOTES);
}
